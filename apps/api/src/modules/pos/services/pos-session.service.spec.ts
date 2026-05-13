import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SessionStatus, WsEventType } from '@erp/shared-interfaces';
import { PosSessionService } from './pos-session.service';
import {
  PosSessionEntity,
  SessionReconciliationEntity,
} from '../entities';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import {
  CashAccountEntity,
  CashAccountType,
} from '../../accounting/cash/cash-account.entity';
import {
  CashMovementEntity,
  CashMovementType,
} from '../../accounting/cash/cash-movement.entity';

describe('PosSessionService', () => {
  let service: PosSessionService;
  let sessionRepo: Record<string, jest.Mock>;
  let reconciliationRepo: Record<string, jest.Mock>;
  let cashAccountRepo: Record<string, jest.Mock>;
  let cashMovementRepo: Record<string, jest.Mock>;
  let wsEmitter: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  beforeEach(async () => {
    sessionRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'session-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
    };

    reconciliationRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'recon-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
    };

    cashAccountRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'cash-1',
        name: 'Quầy 1',
        type: CashAccountType.REGISTER,
        branchId: 'branch-1',
        organizationId: 'org-1',
      }),
    };

    cashMovementRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    wsEmitter = {
      emitToBranch: jest.fn(),
    };

    sessionRepo.findOne = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosSessionService,
        { provide: getRepositoryToken(PosSessionEntity), useValue: sessionRepo },
        { provide: getRepositoryToken(SessionReconciliationEntity), useValue: reconciliationRepo },
        { provide: getRepositoryToken(CashAccountEntity), useValue: cashAccountRepo },
        { provide: getRepositoryToken(CashMovementEntity), useValue: cashMovementRepo },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
      ],
    }).compile();

    service = module.get(PosSessionService);
  });

  describe('openSession', () => {
    const openDto = {
      branchId: 'branch-1',
      cashAccountId: 'cash-1',
      openingCashAmount: 500,
    };

    it('should create a session with OPEN status and cashAccountId set', async () => {
      const result = await service.openSession(openDto, actor);

      expect(result.status).toBe(SessionStatus.OPEN);
      expect(result.openingCashAmount).toBe(500);
      expect(result.openedBy).toBe('user-1');
      expect(result.cashAccountId).toBe('cash-1');
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SessionStatus.OPEN,
          branchId: 'branch-1',
          cashAccountId: 'cash-1',
        }),
      );
    });

    it('throws NotFoundException when cash_account does not exist', async () => {
      cashAccountRepo.findOne.mockResolvedValue(null);
      await expect(service.openSession(openDto, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when cash_account.type is not REGISTER', async () => {
      cashAccountRepo.findOne.mockResolvedValue({
        id: 'cash-1',
        name: 'Két chính',
        type: CashAccountType.SAFE,
        branchId: 'branch-1',
        organizationId: 'org-1',
      });
      await expect(service.openSession(openDto, actor)).rejects.toThrow(/REGISTER/);
    });

    it('throws BadRequestException when cash_account.branchId differs', async () => {
      cashAccountRepo.findOne.mockResolvedValue({
        id: 'cash-1',
        name: 'Quầy 1',
        type: CashAccountType.REGISTER,
        branchId: 'branch-2',
        organizationId: 'org-1',
      });
      await expect(service.openSession(openDto, actor)).rejects.toThrow(/branch mismatch/);
    });

    it('throws ConflictException when cash_account already in use by an active session', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-existing',
        cashAccountId: 'cash-1',
        status: SessionStatus.OPEN,
      });
      await expect(service.openSession(openDto, actor)).rejects.toThrow(ConflictException);
    });
  });

  describe('calculateExpectedCash (via startClose) — TKT-057', () => {
    const sessionWithCashAccount = {
      id: 'session-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      status: SessionStatus.ACTIVE_SALES,
      openingCashAmount: 500,
      cashAccountId: 'cash-1',
      openedAt: new Date('2026-05-11T00:00:00Z'),
      closedAt: undefined,
    };

    it('returns opening when no movements', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...sessionWithCashAccount });
      cashMovementRepo.find.mockResolvedValue([]);

      const result = await service.startClose('session-1', actor);

      expect(result.expectedCash).toBe(500);
    });

    it('adds DEPOSIT, subtracts WITHDRAWAL, adds ADJUSTMENT', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...sessionWithCashAccount });
      cashMovementRepo.find.mockResolvedValue([
        { type: CashMovementType.DEPOSIT, amount: 300, cashAccountId: 'cash-1' },
        { type: CashMovementType.WITHDRAWAL, amount: 100, cashAccountId: 'cash-1' },
        { type: CashMovementType.ADJUSTMENT, amount: 20, cashAccountId: 'cash-1' },
      ]);

      const result = await service.startClose('session-1', actor);

      // 500 + 300 - 100 + 20 = 720
      expect(result.expectedCash).toBe(720);
    });

    it('subtracts TRANSFER where cash_account_id = session.cashAccountId (outflow)', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...sessionWithCashAccount });
      cashMovementRepo.find.mockResolvedValue([
        {
          type: CashMovementType.TRANSFER,
          amount: 200,
          cashAccountId: 'cash-1',
          toAccountId: 'safe-1',
        },
      ]);

      const result = await service.startClose('session-1', actor);

      // 500 - 200 = 300
      expect(result.expectedCash).toBe(300);
    });

    it('adds TRANSFER where to_account_id = session.cashAccountId (inflow)', async () => {
      sessionRepo.findOne.mockResolvedValue({ ...sessionWithCashAccount });
      cashMovementRepo.find.mockResolvedValue([]);
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            type: CashMovementType.TRANSFER,
            amount: 150,
            toAccountId: 'cash-1',
            cashAccountId: 'safe-1',
          },
        ]),
      };
      cashMovementRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.startClose('session-1', actor);

      // 500 + 150 = 650
      expect(result.expectedCash).toBe(650);
    });
  });

  describe('startClose', () => {
    it('should transition ACTIVE_SALES -> CLOSING', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.ACTIVE_SALES,
        openingCashAmount: 500,
      });

      const result = await service.startClose('session-1', actor);

      expect(result.session.status).toBe(SessionStatus.CLOSING);
      expect(typeof result.expectedCash).toBe('number');
      expect(sessionRepo.save).toHaveBeenCalled();
    });

    it('should reject if session is not ACTIVE_SALES', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        status: SessionStatus.OPEN,
      });

      await expect(service.startClose('session-1', actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitReconciliation', () => {
    it('should calculate variance between expected and actual cash', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.CLOSING,
        openingCashAmount: 500,
      });
      reconciliationRepo.findOne.mockResolvedValue(null);

      const result = await service.submitReconciliation(
        'session-1',
        { actualCash: 510 },
        actor,
      );

      expect(result.expectedCash).toBe(500);
      expect(result.actualCash).toBe(510);
      expect(result.variance).toBe(10);
    });

    it('should auto-approve when variance is within threshold', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.CLOSING,
        openingCashAmount: 500,
      });
      reconciliationRepo.findOne.mockResolvedValue(null);

      const result = await service.submitReconciliation(
        'session-1',
        { actualCash: 500 },
        actor,
      );

      expect(result.varianceApproved).toBe(true);
    });
  });

  describe('finalizeClose', () => {
    it('should require an approved reconciliation', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.CLOSING,
      });
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.finalizeClose('session-1', actor)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.finalizeClose('session-1', actor)).rejects.toThrow(
        /without reconciliation/,
      );
    });

    it('should reject unapproved variance', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.CLOSING,
      });
      reconciliationRepo.findOne.mockResolvedValue({
        variance: 200,
        varianceApproved: false,
      });

      await expect(service.finalizeClose('session-1', actor)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.finalizeClose('session-1', actor)).rejects.toThrow(
        /supervisor approval/,
      );
    });

    it('should emit websocket event on successful close', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: SessionStatus.CLOSING,
      });
      reconciliationRepo.findOne.mockResolvedValue({
        variance: 0,
        varianceApproved: true,
        expectedCash: 500,
        actualCash: 500,
      });

      const result = await service.finalizeClose('session-1', actor);

      expect(result.status).toBe(SessionStatus.CLOSED);
      expect(result.closedBy).toBe('user-1');
      expect(wsEmitter.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({
          eventType: WsEventType.RECONCILIATION_COMPLETED,
          payload: expect.objectContaining({
            sessionId: 'session-1',
          }),
        }),
      );
    });
  });
});
