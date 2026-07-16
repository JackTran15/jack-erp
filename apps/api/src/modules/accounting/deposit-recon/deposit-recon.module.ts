import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { CashModule } from '../cash/cash.module';
import { CashVouchersModule } from '../cash-vouchers/cash-vouchers.module';
import { DepositVouchersModule } from '../deposit-vouchers/deposit-vouchers.module';
import { DepositAuditModule } from '../deposit-audit/deposit-audit.module';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositReconBatchEntity } from './deposit-recon-batch.entity';
import { DepositReconService } from './deposit-recon.service';
import { DepositReconController } from './deposit-recon.controller';

/**
 * Bank-statement reconciliation (FR-09, GĐ3). Depends on DepositVouchersModule
 * for the BR-REC-03 fee-adjustment DRAFT proposal (createDraftInternal).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DepositMovementEntity, DepositReconBatchEntity]),
    DocumentNumberingModule,
    CashModule,
    CashVouchersModule,
    DepositVouchersModule,
    DepositAuditModule,
  ],
  controllers: [DepositReconController],
  providers: [DepositReconService],
  exports: [DepositReconService],
})
export class DepositReconModule {}
