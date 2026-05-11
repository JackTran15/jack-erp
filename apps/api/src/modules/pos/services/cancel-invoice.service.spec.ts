import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WsEventType } from '@erp/shared-interfaces';
import { CancelInvoiceService } from './cancel-invoice.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { InvoiceCancelledPublisher } from '../publishers/invoice-cancelled.publisher';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'INV-001',
    status: InvoiceStatus.PAID,
    isDraft: false,
    subtotal: 200,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 200,
    totalPaid: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceEntity;

const itemStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'item-row-1',
    invoiceId: 'inv-1',
    organizationId: 'org-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    quantity: 2,
    unitPrice: 100,
    lineTotal: 200,
    ...overrides,
  }) as InvoiceItemEntity;

describe('CancelInvoiceService', () => {
  let service: CancelInvoiceService;
  let invoiceRepo: { findOne: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let promotionApplyService: { revertPromotions: jest.Mock };
  let invoiceCancelledPublisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockManager = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    invoiceRepo = { findOne: jest.fn().mockResolvedValue(invoiceStub()) };
    itemRepo = { find: jest.fn().mockResolvedValue([itemStub()]) };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
    promotionApplyService = { revertPromotions: jest.fn().mockResolvedValue(undefined) };
    invoiceCancelledPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    wsEmitter = { emitToBranch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelInvoiceService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PromotionApplyService, useValue: promotionApplyService },
        { provide: InvoiceCancelledPublisher, useValue: invoiceCancelledPublisher },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
      ],
    }).compile();

    service = module.get(CancelInvoiceService);
  });

  describe('validation', () => {
    it('throws NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel('inv-x', { reason: 'mistake' }, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws when invoice is DRAFT', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.DRAFT }));
      await expect(service.cancel('inv-1', { reason: 'mistake' }, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice is already CANCELLED', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.CANCELLED }));
      await expect(service.cancel('inv-1', { reason: 'mistake' }, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel PAID invoice', () => {
    it('sets status=CANCELLED, does not close debt, publishes event', async () => {
      const result = await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(result.cancelReason).toBe('mistake-paid');
      expect(mockManager.update).not.toHaveBeenCalledWith(
        InvoiceDebtEntity,
        expect.anything(),
        expect.anything(),
      );
      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('publishes event with items and branchId', async () => {
      await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);

      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          documentNumber: 'INV-001',
          reason: 'mistake-paid',
          branchId: 'branch-1',
          items: [{ itemId: 'item-1', locationId: 'loc-1', quantity: 2 }],
        }),
        actor,
      );
    });

    it('reverts promotions inside the transaction', async () => {
      await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);
      expect(promotionApplyService.revertPromotions).toHaveBeenCalledWith('inv-1', mockManager);
    });
  });

  describe('cancel DEBT invoice', () => {
    it('closes outstanding debt', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.DEBT, totalPaid: 0 }));
      await service.cancel('inv-1', { reason: 'mistake-debt' }, actor);

      expect(mockManager.update).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        { invoiceId: 'inv-1', organizationId: 'org-1' },
        expect.objectContaining({ status: DebtStatus.PAID }),
      );
    });
  });

  describe('cancel PARTIAL_DEBT invoice', () => {
    it('is permitted and closes outstanding debt', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ status: InvoiceStatus.PARTIAL_DEBT, totalPaid: 120 }),
      );
      const result = await service.cancel('inv-1', { reason: 'mistake-partial' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(mockManager.update).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        { invoiceId: 'inv-1', organizationId: 'org-1' },
        expect.objectContaining({ status: DebtStatus.PAID }),
      );
      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('items filtering', () => {
    it('excludes items without locationId from the published payload', async () => {
      itemRepo.find.mockResolvedValue([
        itemStub({ itemId: 'item-1', locationId: 'loc-1' }),
        itemStub({ itemId: 'item-2', locationId: undefined }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ itemId: 'item-1', locationId: 'loc-1', quantity: 2 }],
        }),
        actor,
      );
    });
  });
});
