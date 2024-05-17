import { Field } from '@nestjs/graphql';
import { InputType } from '@nestjs/graphql';
import { SettlementTransactionProcessStatus } from '../prisma/settlement-transaction-process-status.enum';
import { BinanceIncomingTxnUncheckedCreateNestedOneWithoutSettlementTransactionInput } from '../binance-incoming-txn/binance-incoming-txn-unchecked-create-nested-one-without-settlement-transaction.input';

@InputType()
export class SettlementTransactionUncheckedCreateInput {

    @Field(() => String, {nullable:true})
    id?: string;

    @Field(() => Date, {nullable:true})
    createdAt?: Date | string;

    @Field(() => Date, {nullable:true})
    updatedAt?: Date | string;

    @Field(() => String, {nullable:true})
    orderId?: string;

    @Field(() => Date, {nullable:true})
    orderplaceTime?: Date | string;

    @Field(() => String, {nullable:true})
    amountReceived?: string;

    @Field(() => SettlementTransactionProcessStatus, {nullable:true})
    status?: keyof typeof SettlementTransactionProcessStatus;

    @Field(() => BinanceIncomingTxnUncheckedCreateNestedOneWithoutSettlementTransactionInput, {nullable:true})
    incomingTxn?: BinanceIncomingTxnUncheckedCreateNestedOneWithoutSettlementTransactionInput;
}
