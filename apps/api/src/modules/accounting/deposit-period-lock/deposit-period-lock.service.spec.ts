import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositPeriodLockService } from './deposit-period-lock.service';
import { DepositPeriodLockEntity, DepositPeriodLockStatus } from './deposit-period-lock.entity';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositBalanceService } from '../deposit/deposit-ledger/deposit-balance.service';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildManager(opts: {
  existingLock?: any;
  accounts?: any[];
}) {
  let idCounter = 0;
  const lockRepo = {
    findOne: jest.fn().mockResolvedValue(opts.existingLock ?? null),
    create: jest.fn((data: any) => ({ id: `lock-${++idCounter}`, ...data })),
    save: jest.fn(async (e: any) => e),
  };
  const accountRepo = { find: jest.fn().mockResolvedValue(opts.accounts ?? []) };
  const manager: any = {
    getRepository: jest.fn((entity: any) => {
      if (entity === DepositPeriodLockEntity) return lockRepo;
      if (entity === DepositAccountEntity) return accountRepo;
      return {};
    }),
  };
  return { manager, lockRepo, accountRepo };
}

async function setup(manager: any, staleCount = 0) {
  const dataSource = { transaction: jest.fn((cb) => cb(manager)) };
  const lockRepo = { find: jest.fn() };
  const accountRepo = { find: jest.fn() };
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getCount: jest.fn().mockResolvedValue(staleCount),
  };
  const movementRepo = { createQueryBuilder: jest.fn(() => qb) };
  const balances = {
    getBalances: jest
      .fn()
      .mockResolvedValue({ bookBalance: 1_000_000, availableBalance: 900_000, pendingClearingAmount: 100_000 }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new DepositPeriodLockService(
    lockRepo as any,
    accountRepo as any,
    movementRepo as any,
    dataSource as unknown as DataSource,
    balances as unknown as DepositBalanceService,
    audit as unknown as DepositAuditService,
  );
  return { service, balances, audit };
}

describe('DepositPeriodLockService', () => {
  describe('lock', () => {
    it('snapshots the closing balance per account and creates a LOCKED row', async () => {
      const accounts = [{ id: 'acc-1' }, { id: 'acc-2' }];
      const { manager, lockRepo } = buildManager({ accounts });
      const { service, balances, audit } = await setup(manager);

      const result = await service.lock({ branchId: 'branch-1', period: '2026-06' }, actor);

      expect(balances.getBalances).toHaveBeenCalledTimes(2);
      expect(balances.getBalances).toHaveBeenCalledWith('acc-1', actor, '2026-06-30', manager);
      expect(result.status).toBe(DepositPeriodLockStatus.LOCKED);
      expect(result.closingBalanceSnapshot).toHaveLength(2);
      expect(result.closingBalanceSnapshot[0]).toEqual({
        depositAccountId: 'acc-1',
        closingBalance: 1_000_000,
        bookBalance: 1_000_000,
        availableBalance: 900_000,
      });
      expect(lockRepo.save).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOCK_PERIOD' }),
        actor,
        manager,
      );
    });

    it('rejects re-locking an already-LOCKED period', async () => {
      const { manager } = buildManager({
        existingLock: { status: DepositPeriodLockStatus.LOCKED },
      });
      const { service } = await setup(manager);

      await expect(
        service.lock({ branchId: 'branch-1', period: '2026-06' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('BR-REC-04: blocks locking when stale-unreconciled movements exist and force is not set', async () => {
      const { manager } = buildManager({ accounts: [] });
      const { service } = await setup(manager, 3);

      await expect(
        service.lock({ branchId: 'branch-1', period: '2026-06' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BR-REC-04: force=true overrides the stale-unreconciled block', async () => {
      const { manager } = buildManager({ accounts: [] });
      const { service } = await setup(manager, 3);

      await expect(
        service.lock({ branchId: 'branch-1', period: '2026-06', force: true }, actor),
      ).resolves.toBeDefined();
    });
  });

  describe('unlock', () => {
    it('sets UNLOCKED with reason/actor and records an audit row', async () => {
      const lock = {
        id: 'lock-1',
        status: DepositPeriodLockStatus.LOCKED,
        period: '2026-06',
      };
      const { manager, lockRepo } = buildManager({ existingLock: lock });
      const { service, audit } = await setup(manager);

      const result = await service.unlock('lock-1', { reason: 'Điều chỉnh sổ' }, actor);

      expect(result.status).toBe(DepositPeriodLockStatus.UNLOCKED);
      expect(result.unlockReason).toBe('Điều chỉnh sổ');
      expect(result.unlockedBy).toBe('user-1');
      expect(lockRepo.save).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UNLOCK_PERIOD', reason: 'Điều chỉnh sổ' }),
        actor,
        manager,
      );
    });

    it('rejects unlocking a lock that is already UNLOCKED', async () => {
      const { manager } = buildManager({
        existingLock: { id: 'lock-1', status: DepositPeriodLockStatus.UNLOCKED },
      });
      const { service } = await setup(manager);

      await expect(
        service.unlock('lock-1', { reason: 'x' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
