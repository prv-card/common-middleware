import {
  OrderStatus,
  OrderType,
  RestTradeTypes,
  Side,
  Spot,
  TimeInForce,
} from '@binance/connector-typescript';
import { Injectable } from '@nestjs/common';
import { SettlementTransactionProcessStatus } from '@prisma/client';
import moment from 'moment';
import { PrismaService } from 'nestjs-prisma';
import { BinanceIncomingTxn } from 'src/@generated/binance-incoming-txn/binance-incoming-txn.model';

interface OrdersResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: OrderStatus | '';
  timeInForce: TimeInForce | '';
  type: OrderType | '';
  side: Side | '';
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  workingTime: number;
  origQuoteOrderQty: string;
}

@Injectable()
export class BinanceOrderManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async initSellOrder(record: BinanceIncomingTxn, binanceClient: Spot) {
    try {
      const options: RestTradeTypes.newOrderOptions = {
        quantity: Number(record.amountInPaidCurrency),
        newClientOrderId: record.id,
      };
  
      const resp = await binanceClient.newOrder(
        `${record.paidCurrency}USDT`,
        Side.SELL,
        OrderType.MARKET,
        options,
      );
  
      const { orderId, transactTime } = resp;
  
      await this.prisma.binanceIncomingTxn.update({
        data: {
          status: 'SETTLEMENT_INITIALZED',
          settlementTransaction: {
            create: {
              orderId: orderId.toString(),
              orderplaceTime: moment(transactTime).toDate(),
            },
          },
        },
        where: {
          id: record.id,
        },
      });
    } catch (err) {
      console.error("initSellOrder",err)
    }
  }

  async handleUnInitializedOrders(binanceClient: Spot) {
    const records = await this.prisma.binanceIncomingTxn.findMany({
      where: {
        status: 'PAYMENT_RECEIVED',
        paidCurrency: {
          not: 'USDT',
        },
      },
    });

    for (const record of records) {
      await this.initSellOrder(record, binanceClient);
    }
  }

  async manageOrder(order: OrdersResponse) {
    let data;
    let failedRemarks: string;

    switch (order.status) {
      case OrderStatus.FILLED:
        const amountReceived = Number(order.cummulativeQuoteQty);
        data = {
          status: SettlementTransactionProcessStatus.SUCCESS,
          amountReceived: amountReceived.toString(),
        };
        break;

      case OrderStatus.REJECTED:
        data = {
          status: SettlementTransactionProcessStatus.FAILED,
        };
        failedRemarks = 'Order Rejected From Exchange';

        break;
      case OrderStatus.EXPIRED:
      case OrderStatus.EXPIRED_IN_MATCH:
        data = {
          status: SettlementTransactionProcessStatus.FAILED,
        };
        failedRemarks = 'Order Rejected From Exchange';
        break;
    }

    if (data) {
      try {
        const resp = await this.prisma.settlementTransaction.update({
          where: {
            orderId: order.orderId.toString(),
            status: {
              not: data.status,
            },
          },
          data: {
            ...data,
          },
        });

        return { ...resp, failedRemarks };
      } catch (err) {}
    }
  }

  async handleOrdersStatus(binanceClient: Spot) {
    const records = await this.prisma.binanceIncomingTxn.findMany({
      where: {
        status: 'SETTLEMENT_INITIALZED',
      },
      include: {
        settlementTransaction: true,
        whitelabelIncomingTransaction: true,
      },
    });
    const btcOrders = [];

    for (const record of records) {
      try {
        const order = await binanceClient.getOrder(
          `${record.paidCurrency}USDT`,
          {
            orderId: Number(record.settlementTransaction.orderId),
          },
        );
        const settlementTxn = await this.manageOrder(order);
        if (settlementTxn) {
          if (settlementTxn.status === 'SUCCESS' && record.network === 'BTC') {
            btcOrders.push({
              senderAddress: record.senderAddress,
              txnHash: record.txnHash,
            });
          }

          await this.prisma.binanceIncomingTxn.update({
            data: {
              status:
                settlementTxn.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
              failedRemarks: settlementTxn.failedRemarks,
            },
            where: {
              id: record.id,
            },
            select: {
              id: true,
            },
          });
        }
      } catch (Err) {
        console.log('handleOrdersStatus', Err);
      }
    }
    await this.handleBTCTxnsFinalizedOrders(btcOrders);
  }

  async handleBTCTxnsFinalizedOrders(
    btcOrders: { senderAddress: string; txnHash: string }[],
  ) {
    for (const order of btcOrders) {
      const btcAddressRecord = await this.prisma.userBTCAddress.findFirst({
        where: {
          address: order.senderAddress.toLowerCase(),
        },
        select: {
          userId: true,
          whitelabelId: true,
        },
      });

      if (btcAddressRecord) {
        await this.prisma.whitelabelIncomingTransaction.create({
          data: {
            userId: btcAddressRecord.userId,
            whitelabelId: btcAddressRecord.whitelabelId,
            provisionTxnHash: order.txnHash,
          },
          select: {
            id: true,
          },
        });
      }
    }
  }

  async handle(lastSyncedAt: number, binanceClient: Spot) {
    try {
      await this.handleUnInitializedOrders(binanceClient);
    } catch (err) {
      console.error('handleUnInitializedOrders', err);
    }

    try {
      await this.handleOrdersStatus(binanceClient);
    } catch (err) {
      console.error('handleOrdersStatus', err);
    }
  }
}
