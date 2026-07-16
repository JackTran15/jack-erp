import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositModule } from '../deposit/deposit.module';
import { JournalModule } from '../journal/journal.module';
import { DepositReconModule } from '../deposit-recon/deposit-recon.module';
import { DepositAuditModule } from '../deposit-audit/deposit-audit.module';
import { DepositRefundService } from './deposit-refund.service';
import { DepositRefundConsumer } from './deposit-refund.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([DepositMovementEntity]),
    DepositModule,
    JournalModule,
    DepositReconModule,
    DepositAuditModule,
  ],
  providers: [DepositRefundService, DepositRefundConsumer],
  exports: [DepositRefundService],
})
export class DepositRefundModule {}
