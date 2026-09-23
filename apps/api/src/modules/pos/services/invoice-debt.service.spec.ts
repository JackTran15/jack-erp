import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InvoiceDebtService } from './invoice-debt.service';
import { computeAmountDue } from './invoice-amount.util';
import { InvoiceDebtEntity, DebtStatus, DebtDocumentType } from '../entities/invoice-debt.entity';
import { DebtPaymentEntity, DebtPaymentMethod } from '../entities/debt-payment.entity';
import { CashReceiptEntity } from '../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CashService } from '../../accounting/cash/cash.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { OutboxService } from '../../events/outbox/outbox.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'inv-1',
    code: 'INV-001',
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    customerId: 'cust-1',
    amountDue: 500,
    ...overrides,
  }) as InvoiceEntity;

const debtStub = (overrides: Partial<InvoiceDebtEntity> = {}): InvoiceDebtEntity => {
  const issuedAt = overrides.issuedAt ?? '2026-05-06';
  return {
    id: 'debt-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    referenceCode: 'INV-001',
    invoiceId: 'inv-1',
    customerId: 'cust-1',
    documentType: DebtDocumentType.CREDIT_INVOICE,
    originalAmount: 500,
    remainingAmount: 500,
    paidAmount: 0,
    status: DebtStatus.OPEN,
    issuedAt,
    // The ledger orders by createdAt; default it to the issue date so tests that
    // set `issuedAt` to imply chronology keep working.
    createdAt: new Date(`${issuedAt}T00:00:00Z`),
    ...overrides,
  } as InvoiceDebtEntity;
};

describe('InvoiceDebtService', () => {
  let service: InvoiceDebtService;
  let debtRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let paymentRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let cashReceiptRepo: { find: jest.Mock };
  let branchRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let cashService: { recordMovement: jest.Mock };
  let cashFundResolver: { resolveOrDefault: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let accountResolver: { resolveDefaultAccount: jest.Mock };
  let mockManager: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    insert: jest.Mock;
    increment: jest.Mock;
    getRepository: jest.Mock;
    query: jest.Mock;
  };

  beforeEach(async () => {
    mockManager = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      insert: jest.fn(),
      increment: jest.fn(),
      getRepository: jest.fn().mockReturnValue({ update: jest.fn(), increment: jest.fn() }),
      query: jest.fn().mockResolvedValue([{ id: 'acc-131' }]),
    };
    cashService = {
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
    };
    cashFundResolver = {
      resolveOrDefault: jest
        .fn()
        .mockImplementation((_org, _branch, cashAccountId?: string) =>
          Promise.resolve(cashAccountId ?? 'branch-fund'),
        ),
    };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    accountResolver = {
      resolveDefaultAccount: jest.fn().mockResolvedValue('acc-131'),
    };

    debtRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: 'debt-new', ...entity })),
    };

    paymentRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    cashReceiptRepo = { find: jest.fn().mockResolvedValue([]) };
    branchRepo = { find: jest.fn().mockResolvedValue([]) };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceDebtService,
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
        { provide: getRepositoryToken(DebtPaymentEntity), useValue: paymentRepo },
        { provide: getRepositoryToken(CashReceiptEntity), useValue: cashReceiptRepo },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: CashService, useValue: cashService },
        { provide: CashFundResolverService, useValue: cashFundResolver },
        { provide: OutboxService, useValue: outboxService },
        { provide: AccountResolverService, useValue: accountResolver },
      ],
    }).compile();

    service = module.get(InvoiceDebtService);
  });

  // =========================================================================
  // createFromInvoice
  // =========================================================================
  describe('createFromInvoice', () => {
    it('throws BadRequestException when invoice.customerId is null', async () => {
      const invoice = invoiceStub({ customerId: null as any });

      await expect(service.createFromInvoice(invoice)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when invoice.customerId is undefined', async () => {
      const invoice = invoiceStub({ customerId: undefined as any });

      await expect(service.createFromInvoice(invoice)).rejects.toThrow(BadRequestException);
    });

    it('creates debt with correct fields using debtRepo when no manager passed', async () => {
      const invoice = invoiceStub();
      const createdEntity = { ...debtStub() };
      debtRepo.create.mockReturnValue(createdEntity);
      debtRepo.save.mockResolvedValue(createdEntity);

      const result = await service.createFromInvoice(invoice);

      expect(debtRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          originalAmount: invoice.amountDue,
          remainingAmount: invoice.amountDue,
          paidAmount: 0,
          status: DebtStatus.OPEN,
          documentType: DebtDocumentType.CREDIT_INVOICE,
          customerId: invoice.customerId,
          invoiceId: invoice.id,
        }),
      );
      expect(debtRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });

    it('uses provided manager when passed (for atomic checkout integration)', async () => {
      const invoice = invoiceStub();
      const createdEntity = { ...debtStub() };
      mockManager.create.mockReturnValue(createdEntity);
      mockManager.save.mockResolvedValue(createdEntity);

      const result = await service.createFromInvoice(invoice, undefined, mockManager as any);

      expect(mockManager.create).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        expect.objectContaining({
          originalAmount: invoice.amountDue,
          remainingAmount: invoice.amountDue,
          paidAmount: 0,
          status: DebtStatus.OPEN,
          documentType: DebtDocumentType.CREDIT_INVOICE,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(createdEntity);
      expect(debtRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(createdEntity);
    });

    it('stores dueDate and creditDays when both are provided', async () => {
      const invoice = invoiceStub();
      const createdEntity = { ...debtStub() };
      debtRepo.create.mockReturnValue(createdEntity);
      debtRepo.save.mockResolvedValue(createdEntity);

      await service.createFromInvoice(invoice, undefined, undefined, {
        dueDate: '2999-12-31',
        creditDays: 9,
      });

      expect(debtRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: '2999-12-31', creditDays: 9 }),
      );
    });

    it('derives dueDate from creditDays when only creditDays is provided', async () => {
      const invoice = invoiceStub();
      const createdEntity = { ...debtStub() };
      debtRepo.create.mockReturnValue(createdEntity);
      debtRepo.save.mockResolvedValue(createdEntity);

      const today = new Date().toISOString().split('T')[0];
      const expectedDue = new Date(
        new Date(`${today}T00:00:00Z`).getTime() + 10 * 86_400_000,
      )
        .toISOString()
        .split('T')[0];

      await service.createFromInvoice(invoice, undefined, undefined, {
        creditDays: 10,
      });

      expect(debtRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: expectedDue, creditDays: 10 }),
      );
    });

    it('derives creditDays from dueDate when only dueDate is provided', async () => {
      const invoice = invoiceStub();
      const createdEntity = { ...debtStub() };
      debtRepo.create.mockReturnValue(createdEntity);
      debtRepo.save.mockResolvedValue(createdEntity);

      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(
        new Date(`${today}T00:00:00Z`).getTime() + 15 * 86_400_000,
      )
        .toISOString()
        .split('T')[0];

      await service.createFromInvoice(invoice, undefined, undefined, { dueDate });

      expect(debtRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate, creditDays: 15 }),
      );
    });

    it('throws BadRequestException when dueDate is before the issue date', async () => {
      const invoice = invoiceStub();
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(
        new Date(`${today}T00:00:00Z`).getTime() - 86_400_000,
      )
        .toISOString()
        .split('T')[0];

      await expect(
        service.createFromInvoice(invoice, undefined, undefined, {
          dueDate: yesterday,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // COD: original_amount = what the shipper actually collects (T-05-02)
  //
  // ADR-04 / AC-17. `amountDue` is built by the real `computeAmountDue` here,
  // not by a literal, so these cases go red the moment the fee stops reaching
  // the amount — which is the only way the debt could stop carrying it.
  // `createFromInvoice` does no arithmetic of its own: it stores what it is
  // handed. Adding the fee a second time in this service would show up as
  // 910.000 / 1.060.000 below.
  // =========================================================================
  describe('createFromInvoice — COD debt equals the fee-inclusive amount due', () => {
    const openedDebt = () => {
      const createdEntity = { ...debtStub() };
      debtRepo.create.mockReturnValue(createdEntity);
      debtRepo.save.mockResolvedValue(createdEntity);
      return () => debtRepo.create.mock.calls[0][0] as Partial<InvoiceDebtEntity>;
    };

    it('opens the debt at the fee-inclusive amount due (1.000.000 − 100.000 − 50.000 + 30.000 = 880.000)', async () => {
      const amountDue = computeAmountDue({
        subtotal: 1_000_000,
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
        shippingFeeAmount: 30_000,
      });
      expect(amountDue).toBe(880_000);

      const debtData = openedDebt();
      await service.createFromInvoice(invoiceStub({ amountDue }));

      expect(debtData()).toMatchObject({
        originalAmount: 880_000,
        remainingAmount: 880_000,
        paidAmount: 0,
        status: DebtStatus.OPEN,
      });
      // Not the pre-fee 850.000 (fee dropped) and not 910.000 (fee billed twice).
      expect(debtData().originalAmount).not.toBe(850_000);
      expect(debtData().originalAmount).not.toBe(910_000);
    });

    it('demo case: 1.000.000 goods + 30.000 fee, nothing paid → one OPEN debt of 1.030.000', async () => {
      const amountDue = computeAmountDue({
        subtotal: 1_000_000,
        shippingFeeAmount: 30_000,
      });
      expect(amountDue).toBe(1_030_000);

      const debtData = openedDebt();
      await service.createFromInvoice(invoiceStub({ amountDue }));

      expect(debtData()).toMatchObject({
        originalAmount: 1_030_000,
        remainingAmount: 1_030_000,
        status: DebtStatus.OPEN,
        documentType: DebtDocumentType.CREDIT_INVOICE,
      });
    });

    it('a fee-free invoice is numerically identical to before the fee existed (850.000)', async () => {
      const amountDue = computeAmountDue({
        subtotal: 1_000_000,
        discountAmount: 100_000,
        pointsDiscountAmount: 50_000,
      });
      expect(amountDue).toBe(850_000);

      const debtData = openedDebt();
      await service.createFromInvoice(invoiceStub({ amountDue }));

      expect(debtData()).toMatchObject({
        originalAmount: 850_000,
        remainingAmount: 850_000,
      });
    });

    it('goods part fully discounted → the debt is exactly the delivery fee (A-22)', async () => {
      // The clamp inside computeAmountDue wraps the goods part only, so a
      // discount that eats the whole sale still leaves the fee to collect.
      const amountDue = computeAmountDue({
        subtotal: 1_000_000,
        discountAmount: 1_000_000,
        shippingFeeAmount: 30_000,
      });
      expect(amountDue).toBe(30_000);

      const debtData = openedDebt();
      await service.createFromInvoice(invoiceStub({ amountDue }));

      expect(debtData()).toMatchObject({
        originalAmount: 30_000,
        remainingAmount: 30_000,
        status: DebtStatus.OPEN,
      });
    });

    it('reuses the existing credit-invoice debt type — COD adds no new document type', async () => {
      const debtData = openedDebt();
      await service.createFromInvoice(
        invoiceStub({ amountDue: computeAmountDue({ subtotal: 1_000_000, shippingFeeAmount: 30_000 }) }),
      );

      expect(debtData().documentType).toBe(DebtDocumentType.CREDIT_INVOICE);
    });

    it('points the debt at the order customer, never a walk-in (A-01)', async () => {
      const debtData = openedDebt();
      await service.createFromInvoice(
        invoiceStub({ customerId: 'cust-web-0909', amountDue: 1_030_000 }),
      );

      expect(debtData().customerId).toBe('cust-web-0909');
      expect(debtData().invoiceId).toBe('inv-1');
      // A walk-in sale (no customer) cannot open a COD debt at all.
      await expect(
        service.createFromInvoice(invoiceStub({ customerId: null as any })),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // findCustomerDebts
  // =========================================================================
  describe('findCustomerDebts', () => {
    it('queries by customerId and organizationId', async () => {
      debtRepo.find.mockResolvedValue([debtStub()]);

      await service.findCustomerDebts('cust-1', undefined, actor);

      expect(debtRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 'cust-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('applies status filter when provided', async () => {
      debtRepo.find.mockResolvedValue([]);

      await service.findCustomerDebts('cust-1', DebtStatus.OPEN, actor);

      expect(debtRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: DebtStatus.OPEN }),
        }),
      );
    });

    it('returns all statuses when status is undefined', async () => {
      const debts = [debtStub(), debtStub({ id: 'debt-2', status: DebtStatus.PAID })];
      debtRepo.find.mockResolvedValue(debts);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      const callArg = debtRepo.find.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('status');
      expect(result).toHaveLength(2);
    });

    it('merges collections as signed rows with a running balance', async () => {
      debtRepo.find.mockResolvedValue([
        debtStub({ originalAmount: 5_000_000, issuedAt: '2026-07-01' }),
      ]);
      paymentRepo.find.mockResolvedValue([
        {
          id: 'pay-1',
          debtId: 'debt-1',
          amount: 2_000_000,
          paymentMethod: DebtPaymentMethod.CASH,
          paidAt: new Date('2026-07-05T03:00:00Z'),
          createdAt: new Date('2026-07-05T03:00:00Z'),
          cashReceiptId: 'rcpt-1',
          branchId: 'branch-1',
        },
        {
          id: 'pay-2',
          debtId: 'debt-1',
          amount: 3_000_000,
          paymentMethod: DebtPaymentMethod.BANK_TRANSFER,
          paidAt: new Date('2026-07-10T03:00:00Z'),
          createdAt: new Date('2026-07-10T03:00:00Z'),
          cashReceiptId: 'rcpt-2',
          branchId: 'branch-1',
        },
      ]);
      cashReceiptRepo.find.mockResolvedValue([
        { id: 'rcpt-1', documentNumber: 'PT-010' },
        { id: 'rcpt-2', documentNumber: 'PT-021' },
      ]);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      expect(
        result.map((r) => [r.documentType, r.amount, r.runningBalance]),
      ).toEqual([
        ['credit_invoice', 5_000_000, 5_000_000],
        ['collect_debt_cash', -2_000_000, 3_000_000],
        ['collect_debt_bank', -3_000_000, 0],
      ]);
      expect(result[1]).toMatchObject({
        kind: 'collection',
        invoiceId: 'inv-1',
        referenceCode: 'PT-010',
      });
    });

    it('falls back to the debt referenceCode when the receipt has no number', async () => {
      debtRepo.find.mockResolvedValue([
        debtStub({ referenceCode: 'INV-777', originalAmount: 1_000 }),
      ]);
      paymentRepo.find.mockResolvedValue([
        {
          id: 'pay-1',
          debtId: 'debt-1',
          amount: 400,
          paymentMethod: DebtPaymentMethod.CASH,
          paidAt: new Date('2026-07-05T03:00:00Z'),
          createdAt: new Date('2026-07-05T03:00:00Z'),
          cashReceiptId: undefined,
          branchId: 'branch-1',
        },
      ]);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      expect(cashReceiptRepo.find).not.toHaveBeenCalled();
      expect(result[1].referenceCode).toBe('INV-777');
      expect(result[1].runningBalance).toBe(600);
    });

    it('keeps the running balance correct with a negative return-adjustment marker', async () => {
      debtRepo.find.mockResolvedValue([
        debtStub({ id: 'debt-1', originalAmount: 5_000_000, issuedAt: '2026-07-01' }),
        debtStub({
          id: 'debt-2',
          invoiceId: 'inv-2',
          documentType: DebtDocumentType.ADJUSTMENT,
          originalAmount: -2_000_000,
          remainingAmount: 0,
          status: DebtStatus.PAID,
          issuedAt: '2026-07-03',
        }),
      ]);
      paymentRepo.find.mockResolvedValue([]);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      expect(result.map((r) => r.runningBalance)).toEqual([5_000_000, 3_000_000]);
    });

    it('resolves the branch display name for ledger rows', async () => {
      debtRepo.find.mockResolvedValue([debtStub({ branchId: 'branch-1' })]);
      paymentRepo.find.mockResolvedValue([]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-1', name: 'Chi nhánh Q1' }]);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      expect(result[0].branchName).toBe('Chi nhánh Q1');
    });

    it('returns createdAt and orders by it when the issue date is identical', async () => {
      // Same issuedAt (date-only), but createdAt timestamps differ — the ledger
      // must follow createdAt, newest event last, running balance in that order.
      debtRepo.find.mockResolvedValue([
        debtStub({
          id: 'debt-late',
          originalAmount: 700,
          issuedAt: '2026-07-13',
          createdAt: new Date('2026-07-13T09:00:00Z'),
        }),
        debtStub({
          id: 'debt-early',
          invoiceId: 'inv-early',
          originalAmount: 500,
          issuedAt: '2026-07-13',
          createdAt: new Date('2026-07-13T05:00:00Z'),
        }),
      ]);
      paymentRepo.find.mockResolvedValue([]);

      const result = await service.findCustomerDebts('cust-1', undefined, actor);

      expect(result.map((r) => r.id)).toEqual(['debt-early', 'debt-late']);
      expect(result.map((r) => r.runningBalance)).toEqual([500, 1200]);
      expect(result[0].createdAt).toBe('2026-07-13T05:00:00.000Z');
    });
  });

  // =========================================================================
  // collectPayment
  // =========================================================================
  describe('collectPayment', () => {
    const paymentDto = {
      amount: 100,
      paymentMethod: DebtPaymentMethod.BANK_TRANSFER,
      staffId: 'staff-1',
      note: 'first payment',
    };

    it('throws NotFoundException when debt not found', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(service.collectPayment('debt-missing', paymentDto, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when debt.status is PAID', async () => {
      mockManager.findOne.mockResolvedValue(debtStub({ status: DebtStatus.PAID }));

      await expect(service.collectPayment('debt-1', paymentDto, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when payment amount exceeds remaining amount', async () => {
      mockManager.findOne.mockResolvedValue(debtStub({ remainingAmount: 50 }));

      await expect(
        service.collectPayment('debt-1', { ...paymentDto, amount: 200 }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('partial payment: decrements remainingAmount, increments paidAmount, status stays OPEN', async () => {
      const debt = debtStub({ originalAmount: 500, remainingAmount: 500, paidAmount: 0 });
      const paymentEntity = { id: 'pay-1', debtId: 'debt-1', amount: 100 };
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue(paymentEntity);
      mockManager.save
        .mockResolvedValueOnce(paymentEntity) // payment save
        .mockResolvedValueOnce({ ...debt, paidAmount: 100, remainingAmount: 400, status: DebtStatus.OPEN }); // debt save

      const result = await service.collectPayment('debt-1', { ...paymentDto, amount: 100 }, actor);

      expect(result.paidAmount).toBe(100);
      expect(result.remainingAmount).toBe(400);
      expect(result.status).toBe(DebtStatus.OPEN);
    });

    it('full payment: sets status to PAID and sets settledAt', async () => {
      const debt = debtStub({ originalAmount: 500, remainingAmount: 500, paidAmount: 0 });
      const paymentEntity = { id: 'pay-1', debtId: 'debt-1', amount: 500 };
      const now = new Date();
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue(paymentEntity);
      mockManager.save
        .mockResolvedValueOnce(paymentEntity)
        .mockResolvedValueOnce({
          ...debt,
          paidAmount: 500,
          remainingAmount: 0,
          status: DebtStatus.PAID,
          settledAt: now,
        });

      const result = await service.collectPayment('debt-1', { ...paymentDto, amount: 500 }, actor);

      expect(result.status).toBe(DebtStatus.PAID);
      expect(result.settledAt).toBeDefined();
    });

    it('inserts a debt_payment record within the transaction', async () => {
      const debt = debtStub({ remainingAmount: 500, paidAmount: 0 });
      const paymentEntity = { id: 'pay-1' };
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue(paymentEntity);
      mockManager.save.mockResolvedValue(debt);

      await service.collectPayment('debt-1', paymentDto, actor);

      expect(mockManager.create).toHaveBeenCalledWith(
        DebtPaymentEntity,
        expect.objectContaining({
          debtId: 'debt-1',
          amount: paymentDto.amount,
          paymentMethod: paymentDto.paymentMethod,
        }),
      );
      expect(mockManager.save).toHaveBeenCalledWith(paymentEntity);
    });

    it('updates the debt record within the transaction', async () => {
      const debt = debtStub({ remainingAmount: 500, paidAmount: 0 });
      const paymentEntity = { id: 'pay-1' };
      const updatedDebt = { ...debt, paidAmount: 100, remainingAmount: 400 };
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue(paymentEntity);
      mockManager.save
        .mockResolvedValueOnce(paymentEntity)
        .mockResolvedValueOnce(updatedDebt);

      const result = await service.collectPayment('debt-1', paymentDto, actor);

      expect(mockManager.save).toHaveBeenCalledTimes(2);
      expect(result).toEqual(updatedDebt);
    });

    it('CASH: records a DEPOSIT movement and enqueues the voucher event', async () => {
      const debt = debtStub({ remainingAmount: 500, paidAmount: 0 });
      const paymentEntity = { id: 'pay-1', debtId: 'debt-1' };
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue(paymentEntity);
      mockManager.save.mockResolvedValue(debt);

      await service.collectPayment(
        'debt-1',
        {
          amount: 100,
          paymentMethod: DebtPaymentMethod.CASH,
          staffId: 'staff-1',
          cashAccountId: 'cash-1',
        },
        actor,
      );

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ cashAccountId: 'cash-1', amount: 100 }),
        actor,
        mockManager,
      );
      expect(outboxService.enqueue).toHaveBeenCalledWith(
        mockManager,
        expect.stringContaining('debt_payment'),
        expect.objectContaining({
          payload: expect.objectContaining({ sourceType: 'DEBT_PAYMENT' }),
        }),
      );
    });

    it('CASH without cashAccountId defaults to the branch cash fund', async () => {
      const debt = debtStub({ remainingAmount: 500, paidAmount: 0 });
      mockManager.findOne.mockResolvedValue(debt);
      mockManager.create.mockReturnValue({ id: 'pay-1' });
      mockManager.save.mockResolvedValue(debt);

      await service.collectPayment(
        'debt-1',
        { amount: 100, paymentMethod: DebtPaymentMethod.CASH, staffId: 's-1' },
        actor,
      );

      expect(cashFundResolver.resolveOrDefault).toHaveBeenCalledWith(
        'org-1',
        'branch-1',
        undefined,
        mockManager,
      );
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({ cashAccountId: 'branch-fund', amount: 100 }),
        actor,
        mockManager,
      );
    });

    // AC-20 — the shipper hands the COD money in and the debt closes. `save`
    // echoes its argument here rather than returning a canned row, so the
    // assertions are about the arithmetic this service performs, not about the
    // mock's own numbers.
    describe('COD settlement (T-05-02)', () => {
      const echoSaves = () =>
        mockManager.save.mockImplementation((e: unknown) => Promise.resolve(e));

      it('collecting the whole fee-inclusive amount settles the debt: PAID, remaining 0', async () => {
        const debt = debtStub({
          originalAmount: 1_030_000,
          remainingAmount: 1_030_000,
          paidAmount: 0,
        });
        mockManager.findOne.mockResolvedValue(debt);
        mockManager.create.mockReturnValue({ id: 'pay-1', debtId: 'debt-1' });
        echoSaves();

        const result = await service.collectPayment(
          'debt-1',
          { ...paymentDto, amount: 1_030_000 },
          actor,
        );

        expect(result.status).toBe(DebtStatus.PAID);
        expect(result.remainingAmount).toBe(0);
        expect(result.paidAmount).toBe(1_030_000);
        expect(result.settledAt).toBeInstanceOf(Date);
      });

      it('settles even when the numeric columns come back from TypeORM as strings', async () => {
        const debt = debtStub({
          originalAmount: '1030000.00' as unknown as number,
          remainingAmount: '1030000.00' as unknown as number,
          paidAmount: '0.00' as unknown as number,
        });
        mockManager.findOne.mockResolvedValue(debt);
        mockManager.create.mockReturnValue({ id: 'pay-1', debtId: 'debt-1' });
        echoSaves();

        const result = await service.collectPayment(
          'debt-1',
          { ...paymentDto, amount: 1_030_000 },
          actor,
        );

        expect(result.status).toBe(DebtStatus.PAID);
        expect(result.remainingAmount).toBe(0);
      });

      it('paying only the goods part leaves the delivery fee outstanding and the debt OPEN', async () => {
        const debt = debtStub({
          originalAmount: 1_030_000,
          remainingAmount: 1_030_000,
          paidAmount: 0,
        });
        mockManager.findOne.mockResolvedValue(debt);
        mockManager.create.mockReturnValue({ id: 'pay-1', debtId: 'debt-1' });
        echoSaves();

        const result = await service.collectPayment(
          'debt-1',
          { ...paymentDto, amount: 1_000_000 },
          actor,
        );

        expect(result.remainingAmount).toBe(30_000);
        expect(result.status).toBe(DebtStatus.OPEN);
      });

      it('refuses a collection above the fee-inclusive balance', async () => {
        mockManager.findOne.mockResolvedValue(
          debtStub({ originalAmount: 1_030_000, remainingAmount: 1_030_000 }),
        );

        await expect(
          service.collectPayment('debt-1', { ...paymentDto, amount: 1_030_001 }, actor),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  // =========================================================================
  // getPaymentHistory
  // =========================================================================
  describe('getPaymentHistory', () => {
    it('throws NotFoundException when debt not found', async () => {
      debtRepo.findOne.mockResolvedValue(null);

      await expect(service.getPaymentHistory('debt-missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns debt_payments ordered by paidAt DESC', async () => {
      const payments = [
        { id: 'pay-2', debtId: 'debt-1', paidAt: new Date('2026-05-06') },
        { id: 'pay-1', debtId: 'debt-1', paidAt: new Date('2026-05-01') },
      ];
      debtRepo.findOne.mockResolvedValue(debtStub());
      paymentRepo.find.mockResolvedValue(payments);

      const result = await service.getPaymentHistory('debt-1', actor);

      expect(paymentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { debtId: 'debt-1' },
          order: { paidAt: 'DESC' },
        }),
      );
      expect(result).toEqual(payments);
    });
  });
});
