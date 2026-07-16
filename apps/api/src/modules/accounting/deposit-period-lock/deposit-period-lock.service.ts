import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ReconStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositBalanceService } from '../deposit/deposit-ledger/deposit-balance.service';
import { DepositAuditAction, DepositAuditEntityType } from '../deposit-audit/deposit-audit-log.entity';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';
import {
  DepositPeriodLockEntity,
  DepositPeriodLockStatus,
  PeriodClosingBalanceSnapshot,
} from './deposit-period-lock.entity';
import { LockPeriodDto } from './dto/lock-period.dto';
import { UnlockPeriodDto } from './dto/unlock-period.dto';

/** BR-REC-04: warn/block locking a period that still has CHUA movements older than this. */
const STALE_UNRECONCILED_DAYS = 7;

function endOfMonth(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * FR-12 — period close for the deposit fund. `lock()` snapshots every deposit
 * account's closing balance (BR-LOCK-03, becomes next period's opening);
 * `unlock()` is Kế toán trưởng-only and requires a reason (BR-PERM-03).
 */
@Injectable()
export class DepositPeriodLockService {
  constructor(
    @InjectRepository(DepositPeriodLockEntity)
    private readonly lockRepo: Repository<DepositPeriodLockEntity>,
    @InjectRepository(DepositAccountEntity)
    private readonly accountRepo: Repository<DepositAccountEntity>,
    @InjectRepository(DepositMovementEntity)
    private readonly movementRepo: Repository<DepositMovementEntity>,
    private readonly dataSource: DataSource,
    private readonly balances: DepositBalanceService,
    private readonly audit: DepositAuditService,
  ) {}

  async lock(dto: LockPeriodDto, actor: ActorContext): Promise<DepositPeriodLockEntity> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(DepositPeriodLockEntity).findOne({
        where: { organizationId: actor.organizationId, branchId: dto.branchId, period: dto.period },
      });
      if (existing && existing.status === DepositPeriodLockStatus.LOCKED) {
        throw new ConflictException(`Period ${dto.period} is already locked`);
      }

      const staleCount = await this.countStaleUnreconciled(dto.branchId, dto.period, actor);
      if (staleCount > 0 && !dto.force) {
        throw new BadRequestException(
          `${staleCount} movement(s) in this period are still unreconciled for more than ${STALE_UNRECONCILED_DAYS} days (BR-REC-04) — pass force=true to lock anyway`,
        );
      }

      const accounts = await manager.getRepository(DepositAccountEntity).find({
        where: { organizationId: actor.organizationId, branchId: dto.branchId },
      });
      const periodEnd = endOfMonth(dto.period);
      const snapshot: PeriodClosingBalanceSnapshot[] = [];
      for (const acc of accounts) {
        const b = await this.balances.getBalances(acc.id, actor, periodEnd, manager);
        snapshot.push({
          depositAccountId: acc.id,
          closingBalance: b.bookBalance,
          bookBalance: b.bookBalance,
          availableBalance: b.availableBalance,
        });
      }

      const lock = await manager.getRepository(DepositPeriodLockEntity).save(
        manager.getRepository(DepositPeriodLockEntity).create({
          organizationId: actor.organizationId,
          branchId: dto.branchId,
          period: dto.period,
          status: DepositPeriodLockStatus.LOCKED,
          closingBalanceSnapshot: snapshot,
          lockedBy: actor.userId,
          lockedAt: new Date(),
        }),
      );

      await this.audit.record(
        {
          entityType: DepositAuditEntityType.PERIOD_LOCK,
          entityId: lock.id,
          action: DepositAuditAction.LOCK_PERIOD,
          after: lock,
        },
        actor,
        manager,
      );

      return lock;
    });
  }

  async unlock(id: string, dto: UnlockPeriodDto, actor: ActorContext): Promise<DepositPeriodLockEntity> {
    return this.dataSource.transaction(async (manager) => {
      const lock = await manager.getRepository(DepositPeriodLockEntity).findOne({
        where: { id, organizationId: actor.organizationId },
      });
      if (!lock) {
        throw new BadRequestException(`Period lock ${id} not found`);
      }
      if (lock.status !== DepositPeriodLockStatus.LOCKED) {
        throw new BadRequestException(`Period ${lock.period} is not currently locked`);
      }

      const before = { ...lock };
      lock.status = DepositPeriodLockStatus.UNLOCKED;
      lock.unlockedBy = actor.userId;
      lock.unlockedAt = new Date();
      lock.unlockReason = dto.reason;
      await manager.getRepository(DepositPeriodLockEntity).save(lock);

      await this.audit.record(
        {
          entityType: DepositAuditEntityType.PERIOD_LOCK,
          entityId: lock.id,
          action: DepositAuditAction.UNLOCK_PERIOD,
          before,
          after: lock,
          reason: dto.reason,
        },
        actor,
        manager,
      );

      return lock;
    });
  }

  async list(branchId: string | undefined, actor: ActorContext): Promise<DepositPeriodLockEntity[]> {
    return this.lockRepo.find({
      where: { organizationId: actor.organizationId, branchId: branchId ?? actor.branchId },
      order: { period: 'DESC' },
    });
  }

  private async countStaleUnreconciled(
    branchId: string,
    period: string,
    actor: ActorContext,
  ): Promise<number> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - STALE_UNRECONCILED_DAYS);
    return this.movementRepo
      .createQueryBuilder('m')
      .where('m.organizationId = :org', { org: actor.organizationId })
      .andWhere('m.branchId = :branch', { branch: branchId })
      .andWhere('m.reconStatus = :status', { status: ReconStatus.CHUA })
      .andWhere("to_char(m.docDate, 'YYYY-MM') = :period", { period })
      .andWhere('m.docDate <= :cutoff', { cutoff: cutoff.toISOString().slice(0, 10) })
      .getCount();
  }
}
