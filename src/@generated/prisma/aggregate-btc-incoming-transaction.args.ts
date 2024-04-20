import { Field } from '@nestjs/graphql';
import { ArgsType } from '@nestjs/graphql';
import { BTCIncomingTransactionWhereInput } from '../btc-incoming-transaction/btc-incoming-transaction-where.input';
import { Type } from 'class-transformer';
import { BTCIncomingTransactionOrderByWithRelationInput } from '../btc-incoming-transaction/btc-incoming-transaction-order-by-with-relation.input';
import { BTCIncomingTransactionWhereUniqueInput } from '../btc-incoming-transaction/btc-incoming-transaction-where-unique.input';
import { Int } from '@nestjs/graphql';

@ArgsType()
export class AggregateBtcIncomingTransactionArgs {

    @Field(() => BTCIncomingTransactionWhereInput, {nullable:true})
    @Type(() => BTCIncomingTransactionWhereInput)
    where?: BTCIncomingTransactionWhereInput;

    @Field(() => [BTCIncomingTransactionOrderByWithRelationInput], {nullable:true})
    orderBy?: Array<BTCIncomingTransactionOrderByWithRelationInput>;

    @Field(() => BTCIncomingTransactionWhereUniqueInput, {nullable:true})
    cursor?: BTCIncomingTransactionWhereUniqueInput;

    @Field(() => Int, {nullable:true})
    take?: number;

    @Field(() => Int, {nullable:true})
    skip?: number;
}
