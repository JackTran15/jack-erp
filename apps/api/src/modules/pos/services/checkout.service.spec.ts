import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  SessionStatus,
  StockMovementType,
  JournalSource,
  PaymentMethod,
} from '@erp/shared-interfaces';
import { CheckoutService } from './checkout.service';
import { PosSessionEntity, SaleEntity, SaleLineEntity, PaymentEntity } from '../entities';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { CheckoutDto } from '../dto';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let sessionRepo: Record<string, jest.Mock>;
  let saleRepo: Record<string, jest.Mock>;
  let stockLedger: Record<string, jest.Mock>;
  let journalService: Record<string, jest.Mock>;
  let docNumbering: Record<string, jest.Mock>;
  let eventPublisher: Record<string, jest.Mock>;
  let wsEmitter: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const openSession: Partial<PosSessionEntity> = {
    id: 'session-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    status: SessionStatus.ACTIVE_SALES,
  };

  const dto: CheckoutDto = {
    sessionId: 'session-1',
    cashAccountId: 'acc-cash',
    revenueAccountId: 'acc-revenue',
    lines: [
      { itemId: 'item-1', locationId: 'loc-1', quantity: 2, unitPrice: 50, taxAmount: 5 },
    ],
    payments: [
      { method: PaymentMethod.CASH, amount: 105 },
    ],
  };

  beforeEach(async () => {
    sessionRepo = {
      findOne: jest.fn().mockResolvedValue(openSession),
    };

    saleRepo = {
      findOne: jest.fn(),
    };

    stockLedger = {
      getBalance: jest.fn().mockResolvedValue({ quantity: 100 }),
      recordMovement: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    };

    journalService = {
      post: jest.fn().mockResolvedValue({ id: 'je-1' }),
    };

    docNumbering = {
      generate: jest.fn().mockResolvedValue('SALE-2026-0001'),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    wsEmitter = {
      emitToBranch: jest.fn(),
    };

    const mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'sale-1', ...data })),
      save: jest.fn().mockImplementation((data) => {
        if (Array.isArray(data)) return Promise.resolve(data);
        return Promise.resolve(data);
      }),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: getRepositoryToken(PosSessionEntity), useValue: sessionRepo },
        { provide: getRepositoryToken(SaleEntity), useValue: saleRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: StockLedgerService, useValue: stockLedger },
        { provide: JournalService, useValue: journalService },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
      ],
    }).compile();

    service = module.get(CheckoutService);
  });

  describe('checkout', () => {
    it('should create sale, lines, and payments', async () => {
      const result = await service.checkout(dto, actor);

      expect(result).toBeDefined();
      expect(result.documentNumber).toBe('SALE-2026-0001');
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('should record SALE_ISSUE stock movements for each line', async () => {
      await service.checkout(dto, actor);

      expect(stockLedger.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: StockMovementType.SALE_ISSUE,
          quantity: -2,
          itemId: 'item-1',
          locationId: 'loc-1',
          referenceType: 'SALE',
        }),
      );
    });

    it('should post an accounting journal with debit/credit entries', async () => {
      await service.checkout(dto, actor);

      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          source: JournalSource.SALE,
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: 'acc-cash', debitAmount: 105 }),
            expect.objectContaining({ accountId: 'acc-revenue', creditAmount: 105 }),
          ]),
        }),
        actor,
      );
    });

    it('should emit a websocket event', async () => {
      await service.checkout(dto, actor);

      expect(wsEmitter.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({
          payload: expect.objectContaining({
            documentNumber: 'SALE-2026-0001',
          }),
        }),
      );
    });

    it('should reject if session is not OPEN or ACTIVE_SALES', async () => {
      sessionRepo.findOne.mockResolvedValue({
        ...openSession,
        status: SessionStatus.CLOSED,
      });

      await expect(service.checkout(dto, actor)).rejects.toThrow(BadRequestException);
      await expect(service.checkout(dto, actor)).rejects.toThrow(/cannot checkout/);
    });

    it('should publish a domain event', async () => {
      await service.checkout(dto, actor);

      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          payload: expect.objectContaining({
            documentNumber: 'SALE-2026-0001',
          }),
        }),
        expect.any(String),
      );
    });
  });
});
