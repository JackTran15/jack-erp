import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositVouchersModule } from '../deposit-vouchers/deposit-vouchers.module';
import { BankPaymentEntity } from '../deposit-vouchers/bank-payments/bank-payment.entity';
import { DepositRefundConsumer } from './deposit-refund.consumer';
import { InvoiceCancelCollectDepositConsumer } from './invoice-cancel-collect-deposit.consumer';

// The voucher owns the movement, its journal entry and the period check
// (ADR-04), so this module only needs the voucher service — plus the payment
// repo, which is where the collect consumer reads back which fund a cancelled
// return's refund had left from.
@Module({
  imports: [DepositVouchersModule, TypeOrmModule.forFeature([BankPaymentEntity])],
  providers: [DepositRefundConsumer, InvoiceCancelCollectDepositConsumer],
})
export class DepositRefundModule {}
