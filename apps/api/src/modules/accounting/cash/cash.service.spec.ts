import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { CashService } from './cash.service';
import { CashAccountEntity, CashAccountType } from './cash-account.entity';
import { CashMovementEntity, CashMovementType } from './cash-movement.entity';
import { JournalService } from '../journal/journal.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

describe('CashService', () => {
  let service: CashService;
  let accountRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let movementRepo: {
    createQueryBuilder: jest.Mock;
  };
  let sessionRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let journalService: { post: jest.Mock };
  let mockManager: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    accountRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'cash-acc-1', ...entity })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    movementRepo = { createQueryBuilder: jest.fn() };
    sessionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    // recordMovement now runs all DB writes inside a transaction (or the caller's
    // manager). The mock manager is the single source of findOne/save/create.
    mockManager = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
      create: jest.fn((_entity, data) => ({ id: 'mv-1', ...data })),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(mockManager as unknown as EntityManager)),
    };
    journalService = { post: jest.fn().mockResolvedValue({ id: 'je-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashService,
        { provide: getRepositoryToken(CashAccountEntity), useValue: accountRepo },
        { provide: getRepositoryToken(CashMovementEntity), useValue: movementRepo },
        { provide: getRepositoryToken(PosSessionEntity), useValue: sessionRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: JournalService, useValue: journalService },
      ],
    }).compile();

    service = module.get(CashService);
  });

  describe('createAccount', () => {
    it('creates a REGISTER cash account', async () => {
      const saved = await service.createAccount(
        { name: 'Quầy 1', type: CashAccountType.REGISTER, accountId: 'acc-cash' },
        actor,
      );

      expect(accountRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Quầy 1',
          type: CashAccountType.REGISTER,
          accountId: 'acc-cash',
          balance: 0,
          organizationId: 'org-1',
          branchId: 'branch-1',
        }),
      );
      expect(saved.id).toBe('cash-acc-1');
    });

    it('creates a SAFE cash account', async () => {
      await service.createAccount(
        { name: 'Két chính', type: CashAccountType.SAFE, accountId: 'acc-safe' },
        actor,
      );
      const created = accountRepo.create.mock.calls[0][0];
      expect(created.type).toBe(CashAccountType.SAFE);
    });

    it('creates a PETTY_CASH account', async () => {
      await service.createAccount(
        { name: 'Quỹ lẻ', type: CashAccountType.PETTY_CASH, accountId: 'acc-petty' },
        actor,
      );
      const created = accountRepo.create.mock.calls[0][0];
      expect(created.type).toBe(CashAccountType.PETTY_CASH);
    });
  });

  describe('recordMovement (TRANSFER)', () => {
    const sourceAccount = {
      id: 'src-1',
      name: 'Quầy 1',
      accountId: 'gl-cash-1',
      balance: 1000,
      branchId: 'branch-1',
      organizationId: 'org-1',
      type: CashAccountType.REGISTER,
    };
    const destAccount = {
      id: 'dst-1',
      name: 'Két chính',
      accountId: 'gl-safe-1',
      balance: 0,
      branchId: 'branch-1',
      organizationId: 'org-1',
      type: CashAccountType.SAFE,
    };

    it('updates both balances and returns movement + journalEntryId', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ ...sourceAccount })
        .mockResolvedValueOnce({ ...destAccount });

      const result = await service.recordMovement(
        {
          cashAccountId: 'src-1',
          toAccountId: 'dst-1',
          type: CashMovementType.TRANSFER,
          amount: 200,
        },
        actor,
      );

      expect(result.movement.cashAccountId).toBe('src-1');
      expect(result.movement.toAccountId).toBe('dst-1');
      expect(result.movement.type).toBe(CashMovementType.TRANSFER);
      expect(result.journalEntryId).toBe('je-1');
    });

    it('rejects TRANSFER without toAccountId', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...sourceAccount });

      await expect(
        service.recordMovement(
          { cashAccountId: 'src-1', type: CashMovementType.TRANSFER, amount: 100 },
          actor,
        ),
      ).rejects.toThrow(/toAccountId is required/);
    });

    it('rejects TRANSFER when source equals destination', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...sourceAccount });

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'src-1',
            toAccountId: 'src-1',
            type: CashMovementType.TRANSFER,
            amount: 100,
          },
          actor,
        ),
      ).rejects.toThrow(/must differ/);
    });

    it('rejects cross-branch TRANSFER', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ ...sourceAccount })
        .mockResolvedValueOnce({ ...destAccount, branchId: 'branch-2' });

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'src-1',
            toAccountId: 'dst-1',
            type: CashMovementType.TRANSFER,
            amount: 100,
          },
          actor,
        ),
      ).rejects.toThrow(/Cross-branch/);
    });

    it('rejects TRANSFER when source has insufficient balance', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ ...sourceAccount, balance: 50 })
        .mockResolvedValueOnce({ ...destAccount });

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'src-1',
            toAccountId: 'dst-1',
            type: CashMovementType.TRANSFER,
            amount: 100,
          },
          actor,
        ),
      ).rejects.toThrow(/Insufficient balance/);
    });

    it('rejects TRANSFER when destination not found', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ ...sourceAccount })
        .mockResolvedValueOnce(null);

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'src-1',
            toAccountId: 'dst-missing',
            type: CashMovementType.TRANSFER,
            amount: 100,
          },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('posts journal entry with DR destination + CR source', async () => {
      mockManager.findOne
        .mockResolvedValueOnce({ ...sourceAccount })
        .mockResolvedValueOnce({ ...destAccount });

      await service.recordMovement(
        {
          cashAccountId: 'src-1',
          toAccountId: 'dst-1',
          type: CashMovementType.TRANSFER,
          amount: 200,
        },
        actor,
      );

      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'gl-safe-1', debitAmount: 200, creditAmount: 0 }),
            expect.objectContaining({ accountId: 'gl-cash-1', debitAmount: 0, creditAmount: 200 }),
          ],
        }),
        actor,
        mockManager,
      );
    });
  });

  describe('recordMovement (single-account journal — TKT-055)', () => {
    const cashAccount = {
      id: 'cash-1',
      name: 'Quầy 1',
      accountId: 'gl-cash',
      balance: 500,
      branchId: 'branch-1',
      organizationId: 'org-1',
      type: CashAccountType.REGISTER,
    };

    it('rejects DEPOSIT without contraAccountId', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await expect(
        service.recordMovement(
          { cashAccountId: 'cash-1', type: CashMovementType.DEPOSIT, amount: 100 },
          actor,
        ),
      ).rejects.toThrow(/contraAccountId is required/);
    });

    it('rejects when contraAccountId equals cashAccount.accountId', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'cash-1',
            type: CashMovementType.DEPOSIT,
            amount: 100,
            contraAccountId: 'gl-cash',
          },
          actor,
        ),
      ).rejects.toThrow(/must differ/);
    });

    it('DEPOSIT posts DR cash + CR contra', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'gl-revenue',
        },
        actor,
      );

      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'gl-cash', debitAmount: 100, creditAmount: 0 }),
            expect.objectContaining({ accountId: 'gl-revenue', debitAmount: 0, creditAmount: 100 }),
          ],
        }),
        actor,
        mockManager,
      );
    });

    it('WITHDRAWAL posts DR contra + CR cash', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.WITHDRAWAL,
          amount: 50,
          contraAccountId: 'gl-expense',
        },
        actor,
      );

      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'gl-expense', debitAmount: 50, creditAmount: 0 }),
            expect.objectContaining({ accountId: 'gl-cash', debitAmount: 0, creditAmount: 50 }),
          ],
        }),
        actor,
        mockManager,
      );
    });

    it('ADJUSTMENT posts DR cash + CR contra (treated as positive)', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.ADJUSTMENT,
          amount: 20,
          contraAccountId: 'gl-variance',
        },
        actor,
      );

      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: 'gl-cash', debitAmount: 20, creditAmount: 0 }),
            expect.objectContaining({ accountId: 'gl-variance', debitAmount: 0, creditAmount: 20 }),
          ],
        }),
        actor,
        mockManager,
      );
    });

    it('rejects WITHDRAWAL that would drive the balance below zero', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount, balance: 30 });

      await expect(
        service.recordMovement(
          {
            cashAccountId: 'cash-1',
            type: CashMovementType.WITHDRAWAL,
            amount: 100,
            contraAccountId: 'gl-expense',
          },
          actor,
        ),
      ).rejects.toThrow(/Insufficient cash balance/);
    });

    it('journal lines are balanced (debits = credits) for every type', async () => {
      const types: CashMovementType[] = [
        CashMovementType.DEPOSIT,
        CashMovementType.WITHDRAWAL,
        CashMovementType.ADJUSTMENT,
      ];

      for (const type of types) {
        mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });
        journalService.post.mockClear();

        await service.recordMovement(
          {
            cashAccountId: 'cash-1',
            type,
            amount: 100,
            contraAccountId: 'gl-other',
          },
          actor,
        );

        const lines = journalService.post.mock.calls[0][0].lines;
        const totalDebits = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
        const totalCredits = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
        expect(totalDebits).toBe(totalCredits);
      }
    });
  });

  describe('recordMovement (TX composition — TKT-CV-00)', () => {
    const cashAccount = {
      id: 'cash-1',
      name: 'Quầy 1',
      accountId: 'gl-cash',
      balance: 500,
      branchId: 'branch-1',
      organizationId: 'org-1',
      type: CashAccountType.REGISTER,
    };

    it('runs inside the caller manager without opening a new transaction', async () => {
      const callerManager = {
        findOne: jest.fn().mockResolvedValueOnce({ ...cashAccount }),
        save: jest.fn((entity) => Promise.resolve(entity)),
        create: jest.fn((_entity, data) => ({ id: 'mv-9', ...data })),
      };

      const result = await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'gl-revenue',
        },
        actor,
        callerManager as unknown as EntityManager,
      );

      // No nested transaction opened — caller owns the unit of work.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      // JE posted within the same caller manager.
      expect(journalService.post).toHaveBeenCalledWith(
        expect.any(Object),
        actor,
        callerManager,
      );
      expect(result.movement.id).toBe('mv-9');
      expect(result.journalEntryId).toBe('je-1');
    });

    it('opens its own transaction when no manager is passed (backward compatible)', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'gl-revenue',
        },
        actor,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('sessionId auto-fill — TKT-057', () => {
    const cashAccount = {
      id: 'cash-1',
      name: 'Quầy 1',
      accountId: 'gl-cash',
      balance: 1000,
      branchId: 'branch-1',
      organizationId: 'org-1',
      type: CashAccountType.REGISTER,
    };

    it('auto-fills sessionId when active session exists for the cash_account', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });
      sessionRepo.findOne.mockResolvedValue({ id: 'session-1', status: 'OPEN' });

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'gl-revenue',
        },
        actor,
      );

      const created = mockManager.create.mock.calls[0][1];
      expect(created.sessionId).toBe('session-1');
    });

    it('leaves sessionId undefined when no active session', async () => {
      mockManager.findOne.mockResolvedValueOnce({ ...cashAccount });
      sessionRepo.findOne.mockResolvedValue(null);

      await service.recordMovement(
        {
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'gl-revenue',
        },
        actor,
      );

      const created = mockManager.create.mock.calls[0][1];
      expect(created.sessionId).toBeUndefined();
    });
  });

  describe('listAccounts', () => {
    const buildQb = () => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it('applies type filter when provided', async () => {
      const qb = buildQb();
      accountRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listAccounts({ type: CashAccountType.SAFE }, actor);

      expect(qb.andWhere).toHaveBeenCalledWith('ca.type = :type', {
        type: CashAccountType.SAFE,
      });
    });

    it('skips type filter when not provided', async () => {
      const qb = buildQb();
      accountRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listAccounts({}, actor);

      const typeFilterCalls = qb.andWhere.mock.calls.filter(
        (args) => args[0] === 'ca.type = :type',
      );
      expect(typeFilterCalls).toHaveLength(0);
    });
  });
});
