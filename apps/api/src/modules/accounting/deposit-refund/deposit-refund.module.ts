import { Module } from '@nestjs/common';
import { DepositVouchersModule } from '../deposit-vouchers/deposit-vouchers.module';
import { DepositRefundConsumer } from './deposit-refund.consumer';

// The refund voucher owns the movement, its journal entry and the period check
// (ADR-04), so this module only needs the voucher service.
@Module({
  imports: [DepositVouchersModule],
  providers: [DepositRefundConsumer],
})
export class DepositRefundModule {}
