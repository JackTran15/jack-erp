import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SessionStatus, WsEventType } from '@erp/shared-interfaces';
import { PosSessionService } from './pos-session.service';
import {
  PosSessionEntity,
  SaleEntity,
  ReturnEntity,
  PaymentEntity,
  SessionReconciliationEntity,
} from '../entities';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';

describe('PosSessionService', () => {
  let service: PosSessionService;
  let sessionRepo: Record<string, jest.Mock>;
  let saleRepo: Record<string, jest.Mock>;
  let returnRepo: Record<string, jest.Mock>;
  let paymentRepo: Record<string, jest.Mock>;
  let reconciliationRepo: Record<string, jest.Mock>;
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

    saleRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    returnRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    paymentRepo = {};

    reconciliationRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'recon-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
    };

    wsEmitter = {
      emitToBranch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosSessionService,
        { provide: getRepositoryToken(PosSessionEntity), useValue: sessionRepo },
        { provide: getRepositoryToken(SaleEntity), useValue: saleRepo },
        { provide: getRepositoryToken(ReturnEntity), useValue: returnRepo },
        { provide: getRepositoryToken(PaymentEntity), useValue: paymentRepo },
        { provide: getRepositoryToken(SessionReconciliationEntity), useValue: reconciliationRepo },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
      ],
    }).compile();

    service = module.get(PosSessionService);
  });

  describe('openSession', () => {
    it('should create a session with OPEN status', async () => {
      const dto = { branchId: 'branch-1', openingCashAmount: 500 };

      const result = await service.openSession(dto, actor);

      expect(result.status).toBe(SessionStatus.OPEN);
      expect(result.openingCashAmount).toBe(500);
      expect(result.openedBy).toBe('user-1');
      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SessionStatus.OPEN,
          branchId: 'branch-1',
        }),
      );
      expect(sessionRepo.save).toHaveBeenCalled();
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
