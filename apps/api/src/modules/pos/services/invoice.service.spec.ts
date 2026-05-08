import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvoiceService } from './invoice.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';

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
    createdBy: 'user-1',
    code: 'DRAFT-12345',
    sessionId: 'session-1',
    customerId: 'cust-1',
    draftLabel: 'Table 3',
    note: 'Test note',
    isDraft: true,
    status: InvoiceStatus.DRAFT,
    subtotal: 100,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceEntity;

const invoiceItemStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'item-row-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    invoiceId: 'inv-1',
    itemId: 'item-1',
    itemCode: 'ITEM-001',
    itemName: 'Widget',
    unit: 'pcs',
    quantity: 2,
    unitPrice: 50,
    lineDiscount: 0,
    lineTotal: 100,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceItemEntity;

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoiceRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'generated-id', ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };

    invoiceRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };

    itemRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  // ===========================================================================
  // create
  // ===========================================================================
  describe('create', () => {
    it('creates a draft invoice with code prefix DRAFT-', async () => {
      const savedInvoice = invoiceStub();
      // First save returns the invoice, second call (findOne in findOneWithItems) returns it too
      mockManager.save.mockResolvedValueOnce(savedInvoice);
      invoiceRepo.findOne.mockResolvedValue(savedInvoice);
      itemRepo.find.mockResolvedValue([]);

      const dto: CreateInvoiceDto = { sessionId: 'session-1' };
      const result = await service.create(dto, actor);

      const createCall = mockManager.create.mock.calls[0];
      expect(createCall[1].code).toMatch(/^DRAFT-/);
      expect(result).toBeDefined();
    });

    it('sets isDraft=true and status=DRAFT', async () => {
      const savedInvoice = invoiceStub();
      mockManager.save.mockResolvedValueOnce(savedInvoice);
      invoiceRepo.findOne.mockResolvedValue(savedInvoice);
      itemRepo.find.mockResolvedValue([]);

      const dto: CreateInvoiceDto = { sessionId: 'session-1' };
      await service.create(dto, actor);

      const createCall = mockManager.create.mock.calls[0];
      expect(createCall[1].isDraft).toBe(true);
      expect(createCall[1].status).toBe(InvoiceStatus.DRAFT);
    });

    it('calculates subtotal from items (qty × price − discount)', async () => {
      const savedInvoice = invoiceStub({ subtotal: 90 });
      mockManager.save.mockResolvedValueOnce(savedInvoice);
      invoiceRepo.findOne.mockResolvedValue(savedInvoice);
      itemRepo.find.mockResolvedValue([]);

      const dto: CreateInvoiceDto = {
        sessionId: 'session-1',
        items: [
          { itemId: 'item-1', itemCode: 'A', itemName: 'A Name', unit: 'pcs', quantity: 2, unitPrice: 50, lineDiscount: 10 },
        ],
      };

      await service.create(dto, actor);

      // subtotal = 2*50 - 10 = 90
      const createCall = mockManager.create.mock.calls[0];
      expect(createCall[1].subtotal).toBe(90);
    });

    it('creates invoice_items within transaction', async () => {
      const savedInvoice = invoiceStub();
      mockManager.save.mockResolvedValue(savedInvoice);
      invoiceRepo.findOne.mockResolvedValue(savedInvoice);
      itemRepo.find.mockResolvedValue([invoiceItemStub()]);

      const dto: CreateInvoiceDto = {
        sessionId: 'session-1',
        items: [
          { itemId: 'item-1', itemCode: 'A', itemName: 'A Name', unit: 'pcs', quantity: 2, unitPrice: 50 },
        ],
      };

      await service.create(dto, actor);

      // manager.create should be called for InvoiceEntity AND InvoiceItemEntity
      expect(mockManager.create).toHaveBeenCalledTimes(2);
      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('works with empty items array', async () => {
      const savedInvoice = invoiceStub({ subtotal: 0, amountDue: 0 });
      mockManager.save.mockResolvedValueOnce(savedInvoice);
      invoiceRepo.findOne.mockResolvedValue(savedInvoice);
      itemRepo.find.mockResolvedValue([]);

      const dto: CreateInvoiceDto = { sessionId: 'session-1', items: [] };
      const result = await service.create(dto, actor);

      expect(result).toBeDefined();
      // Only one save call (for the invoice itself) since items array is empty
      expect(mockManager.save).toHaveBeenCalledTimes(1);
      const createCall = mockManager.create.mock.calls[0];
      expect(createCall[1].subtotal).toBe(0);
    });
  });

  // ===========================================================================
  // findOne
  // ===========================================================================
  describe('findOne', () => {
    it('returns invoice when found', async () => {
      const stub = invoiceStub();
      invoiceRepo.findOne.mockResolvedValue(stub);

      const result = await service.findOne('inv-1', actor);

      expect(result).toEqual(stub);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'inv-1', organizationId: actor.organizationId },
      });
    });

    it('throws NotFoundException when not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('inv-missing', actor)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // findOneWithItems
  // ===========================================================================
  describe('findOneWithItems', () => {
    it('returns invoice merged with items array', async () => {
      const stub = invoiceStub();
      const itemStubs = [invoiceItemStub(), invoiceItemStub({ id: 'item-row-2', sortOrder: 1 })];
      invoiceRepo.findOne.mockResolvedValue(stub);
      itemRepo.find.mockResolvedValue(itemStubs);

      const result = await service.findOneWithItems('inv-1', actor);

      expect(result.items).toEqual(itemStubs);
      expect(result.id).toBe('inv-1');
    });
  });

  // ===========================================================================
  // update
  // ===========================================================================
  describe('update', () => {
    it('throws BadRequestException if invoice.isDraft=false', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));

      await expect(
        service.update('inv-1', { note: 'new note' }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes old items and inserts new items when dto.items provided', async () => {
      const stub = invoiceStub();
      // findOne is called twice: once in update, once inside findOneWithItems at the end
      invoiceRepo.findOne.mockResolvedValue(stub);
      itemRepo.find.mockResolvedValue([]);

      const dto: UpdateInvoiceDto = {
        items: [
          { itemId: 'item-2', itemCode: 'B', itemName: 'B Name', unit: 'kg', quantity: 3, unitPrice: 20 },
        ],
      };

      await service.update('inv-1', dto, actor);

      expect(mockManager.delete).toHaveBeenCalledWith(InvoiceItemEntity, { invoiceId: 'inv-1' });
      // manager.create called for the new item
      expect(mockManager.create).toHaveBeenCalledWith(
        InvoiceItemEntity,
        expect.objectContaining({ itemId: 'item-2', quantity: 3, unitPrice: 20 }),
      );
    });

    it('recalculates subtotal and amountDue', async () => {
      const stub = invoiceStub({ discountAmount: 0, depositAmount: 0 });
      invoiceRepo.findOne.mockResolvedValue(stub);
      itemRepo.find.mockResolvedValue([]);

      const dto: UpdateInvoiceDto = {
        items: [
          { itemId: 'item-1', itemCode: 'A', itemName: 'A', unit: 'pcs', quantity: 4, unitPrice: 25, lineDiscount: 0 },
        ],
      };

      await service.update('inv-1', dto, actor);

      // After update, manager.save is called with the invoice having updated subtotal/amountDue
      const saveArgs = mockManager.save.mock.calls;
      // Last save call should be the invoice
      const savedInvoice = saveArgs[saveArgs.length - 1][0];
      expect(savedInvoice.subtotal).toBe(100); // 4*25 - 0
      expect(savedInvoice.amountDue).toBe(100); // 100 - 0 - 0
    });

    it('updates customerId, draftLabel, note', async () => {
      const stub = invoiceStub();
      invoiceRepo.findOne.mockResolvedValue(stub);
      itemRepo.find.mockResolvedValue([]);

      const dto: UpdateInvoiceDto = {
        customerId: 'cust-2',
        draftLabel: 'Table 5',
        note: 'Updated note',
      };

      await service.update('inv-1', dto, actor);

      const saveArgs = mockManager.save.mock.calls;
      const savedInvoice = saveArgs[saveArgs.length - 1][0];
      expect(savedInvoice.customerId).toBe('cust-2');
      expect(savedInvoice.draftLabel).toBe('Table 5');
      expect(savedInvoice.note).toBe('Updated note');
    });
  });

  // ===========================================================================
  // remove
  // ===========================================================================
  describe('remove', () => {
    it('throws BadRequestException if invoice.isDraft=false', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));

      await expect(service.remove('inv-1', actor)).rejects.toThrow(BadRequestException);
    });

    it('deletes items then invoice within transaction', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub());

      await service.remove('inv-1', actor);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.delete).toHaveBeenCalledWith(InvoiceItemEntity, { invoiceId: 'inv-1' });
      expect(mockManager.delete).toHaveBeenCalledWith(InvoiceEntity, { id: 'inv-1' });
    });
  });

  // ===========================================================================
  // findDrafts
  // ===========================================================================
  describe('findDrafts', () => {
    it('queries with organizationId + sessionId + isDraft=true', async () => {
      const drafts = [invoiceStub()];
      invoiceRepo.find.mockResolvedValue(drafts);

      const result = await service.findDrafts('session-1', actor);

      expect(result).toEqual(drafts);
      expect(invoiceRepo.find).toHaveBeenCalledWith({
        where: {
          organizationId: actor.organizationId,
          sessionId: 'session-1',
          isDraft: true,
        },
        order: { createdAt: 'DESC' },
      });
    });
  });

  // ===========================================================================
  // findAll
  // ===========================================================================
  describe('findAll', () => {
    let qbMock: Record<string, jest.Mock>;

    beforeEach(() => {
      qbMock = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[invoiceStub()], 1]),
      };
      invoiceRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);
    });

    it('applies status filter when provided', async () => {
      await service.findAll({ status: InvoiceStatus.PAID } as any, actor);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'invoice.status = :status',
        { status: InvoiceStatus.PAID },
      );
    });

    it('applies customerId filter when provided', async () => {
      await service.findAll({ customerId: 'cust-1' } as any, actor);

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'invoice.customer_id = :customerId',
        { customerId: 'cust-1' },
      );
    });

    it('does not apply status filter when not provided', async () => {
      await service.findAll({} as any, actor);

      const andWhereCalls = qbMock.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(andWhereCalls).not.toContain('invoice.status = :status');
    });

    it('does not apply customerId filter when not provided', async () => {
      await service.findAll({} as any, actor);

      const andWhereCalls = qbMock.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(andWhereCalls).not.toContain('invoice.customer_id = :customerId');
    });

    it('returns data and total', async () => {
      const result = await service.findAll({} as any, actor);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
