import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { UserEntity } from '../../auth/user.entity';
import { CashModule } from '../cash/cash.module';
import { CashVouchersModule } from '../cash-vouchers/cash-vouchers.module';
import { DepositVouchersModule } from '../deposit-vouchers/deposit-vouchers.module';
import { DepositAuditModule } from '../deposit-audit/deposit-audit.module';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositReconBatchEntity } from './deposit-recon-batch.entity';
import { DepositReconService } from './deposit-recon.service';
import { DepositReconController } from './deposit-recon.controller';
import { DepositReconV2Controller } from './controllers/deposit-recon-v2.controller';
import { SearchDepositReconV2Handler } from './queries/search-deposit-recon-v2.handler';

/**
 * Bank-statement reconciliation (FR-09, GĐ3). Depends on DepositVouchersModule
 * for the BR-REC-03 fee-adjustment DRAFT proposal (createDraftInternal).
 *
 * DepositAccountEntity and UserEntity are registered so the v2 search handler's
 * leftJoin(Entity, ...) calls can resolve their metadata.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DepositMovementEntity,
      DepositReconBatchEntity,
      DepositAccountEntity,
      UserEntity,
    ]),
    DocumentNumberingModule,
    CashModule,
    CashVouchersModule,
    DepositVouchersModule,
    DepositAuditModule,
    CqrsModule,
  ],
  controllers: [DepositReconV2Controller, DepositReconController],
  providers: [DepositReconService, SearchDepositReconV2Handler],
  exports: [DepositReconService],
})
export class DepositReconModule {}
