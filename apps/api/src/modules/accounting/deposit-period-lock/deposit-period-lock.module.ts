import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositModule } from '../deposit/deposit.module';
import { DepositAuditModule } from '../deposit-audit/deposit-audit.module';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositPeriodLockEntity } from './deposit-period-lock.entity';
import { DepositPeriodLockService } from './deposit-period-lock.service';
import { DepositPeriodLockController } from './deposit-period-lock.controller';

/**
 * `DepositPeriodGuardService` itself lives as a provider inside `DepositModule`
 * (not here) — `PosDepositSaleConsumer` needs it and also lives in
 * `DepositModule`; giving this module the guard would make `DepositModule`
 * depend back on `DepositPeriodLockModule`, a real cross-module cycle (unlike
 * the same-module case `forwardRef` handles). Re-exported below instead.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DepositPeriodLockEntity, DepositAccountEntity, DepositMovementEntity]),
    DepositModule,
    DepositAuditModule,
  ],
  controllers: [DepositPeriodLockController],
  providers: [DepositPeriodLockService],
  // Re-export the whole DepositModule (not the bare DepositPeriodGuardService
  // token) — NestJS only allows re-exporting a provider that came from an
  // imported module by exporting that module itself.
  exports: [DepositPeriodLockService, DepositModule],
})
export class DepositPeriodLockModule {}
