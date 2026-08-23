import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReturnEligibilityService } from './return-eligibility.service';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import { refundableUnitValues } from './refundable-value.util';
import {
  InvoiceDebtEntity,
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('ReturnEligibilityService.getOutstandingDebt', () => {
  let service: ReturnEligibilityService;
  let invoiceRepo: { findOne: jest.Mock };
  let debtRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { findOne: jest.fn() };
    debtRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnEligibilityService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        {
          provide: getRepositoryToken(InvoiceItemEntity),
          useValue: { find: jest.fn() },
        },
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
      ],
    }).compile();

    service = module.get(ReturnEligibilityService);
  });

  it('returns the outstanding remainder of a credit sale', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '465000.00',
      status: DebtStatus.OPEN,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 465000,
    });
    expect(debtRepo.findOne).toHaveBeenCalledWith({
      where: {
        invoiceId: 'inv-1',
        organizationId: 'org-1',
        documentType: DebtDocumentType.CREDIT_INVOICE,
      },
    });
  });

  it('returns 0 when the invoice carries no debt row', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue(null);

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('returns 0 when the debt has been settled', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '0.00',
      status: DebtStatus.PAID,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('clamps a negative remainder from legacy data to 0', async () => {
    invoiceRepo.findOne.mockResolvedValue({ id: 'inv-1' });
    debtRepo.findOne.mockResolvedValue({
      remainingAmount: '-1200.00',
      status: DebtStatus.OPEN,
    });

    await expect(service.getOutstandingDebt('inv-1', actor)).resolves.toEqual({
      remainingDebt: 0,
    });
  });

  it('404s for an invoice outside the actor organisation', async () => {
    invoiceRepo.findOne.mockResolvedValue(null);

    await expect(service.getOutstandingDebt('inv-1', actor)).rejects.toThrow(
      NotFoundException,
    );
    expect(debtRepo.findOne).not.toHaveBeenCalled();
  });
});


const line = (over: Partial<InvoiceItemEntity>): InvoiceItemEntity =>
  ({
    id: 'line-1',
    itemId: 'item-1',
    itemCode: 'SKU-1',
    itemName: 'Sneaker',
    unit: 'pair',
    quantity: 1,
    unitPrice: 0,
    lineDiscount: 0,
    promotionDiscount: 0,
    lineTotal: 0,
    direction: ItemDirection.OUT,
    returnedQuantity: 0,
    sortOrder: 0,
    ...over,
  }) as unknown as InvoiceItemEntity;

const invoiceOf = (over: Partial<InvoiceEntity>): InvoiceEntity =>
  ({
    id: 'inv-1',
    type: InvoiceType.SALE,
    status: InvoiceStatus.PAID,
    discountAmount: 0,
    pointsDiscountAmount: 0,
    depositAmount: 0,
    ...over,
  }) as unknown as InvoiceEntity;

describe('ReturnEligibilityService.getEligibleLines', () => {
  let service: ReturnEligibilityService;
  let invoiceRepo: { findOne: jest.Mock };
  let itemRepo: { find: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { findOne: jest.fn() };
    itemRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnEligibilityService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(InvoiceDebtEntity),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ReturnEligibilityService);
  });

  function stage(invoice: InvoiceEntity, items: InvoiceItemEntity[]) {
    invoiceRepo.findOne.mockResolvedValue(invoice);
    itemRepo.find.mockResolvedValue(items);
  }

  it('offers only the OUT lines of an exchange (AC-08)', async () => {
    stage(invoiceOf({ type: InvoiceType.EXCHANGE }), [
      line({ id: 'in-1', direction: ItemDirection.IN, quantity: 1, lineTotal: 750000 }),
      line({ id: 'out-1', quantity: 1, lineTotal: 900000 }),
      line({ id: 'out-2', quantity: 3, lineTotal: 300000 }),
    ]);

    const lines = await service.getEligibleLines('inv-1', actor);

    expect(lines.map((l) => l.originalInvoiceItemId)).toEqual(['out-1', 'out-2']);
  });

  it('leaves a sale invoice untouched — same lines, same refundable prices', async () => {
    const invoice = invoiceOf({ discountAmount: 150000 });
    const items = [
      line({ id: 'a', quantity: 2, unitPrice: 600000, lineTotal: 1200000 }),
      line({ id: 'b', quantity: 1, unitPrice: 300000, lineTotal: 300000 }),
    ];
    stage(invoice, items);

    const lines = await service.getEligibleLines('inv-1', actor);
    const canonical = refundableUnitValues(invoice, items);

    expect(lines.map((l) => l.originalInvoiceItemId)).toEqual(['a', 'b']);
    for (const l of lines) {
      expect(l.refundableUnitPrice).toBe(canonical.get(l.originalInvoiceItemId));
    }
  });

  it('prices one unit at its share of the line total (AC-09)', async () => {
    stage(invoiceOf({ type: InvoiceType.EXCHANGE }), [
      line({ id: 'out-1', quantity: 2, unitPrice: 600000, lineTotal: 1200000 }),
    ]);

    const [only] = await service.getEligibleLines('inv-1', actor);

    expect(only.refundableUnitPrice).toBe(600000);
  });

  it('caps maxReturnable at what has not been returned yet (AC-10)', async () => {
    stage(invoiceOf({ type: InvoiceType.EXCHANGE }), [
      line({ id: 'out-1', quantity: 2, returnedQuantity: 1, lineTotal: 1200000 }),
      line({ id: 'out-2', quantity: 2, returnedQuantity: 2, lineTotal: 800000 }),
    ]);

    const lines = await service.getEligibleLines('inv-1', actor);

    expect(lines.map((l) => l.maxReturnable)).toEqual([1, 0]);
  });

  it('still refuses a pure return document', async () => {
    stage(invoiceOf({ type: InvoiceType.RETURN }), []);

    await expect(service.getEligibleLines('inv-1', actor)).rejects.toThrow(
      BadRequestException,
    );
  });

  /**
   * ADR-02, and the reason this file exists at all. `refundableUnitValues`
   * spreads the header money the customer never paid across the net value of
   * EVERY line; `CheckoutReturnService.computeReturnedNet` does the same on the
   * full original item set at post time. Filter the input here instead of the
   * output and the divisor shrinks — the POS preview quotes one number, the
   * posted document charges another, and the gap lands as phantom debt.
   */
  it('divides the header residual over every line, not just the OUT ones', async () => {
    const invoice = invoiceOf({
      type: InvoiceType.EXCHANGE,
      pointsDiscountAmount: 100000,
    });
    const inLine = line({
      id: 'in-1',
      direction: ItemDirection.IN,
      quantity: 1,
      lineTotal: 500000,
    });
    const outLine = line({ id: 'out-1', quantity: 2, lineTotal: 1000000 });
    stage(invoice, [inLine, outLine]);

    const [only] = await service.getEligibleLines('inv-1', actor);

    expect(only.refundableUnitPrice).toBe(
      refundableUnitValues(invoice, [inLine, outLine]).get('out-1'),
    );
    // The value a filter-the-input implementation would have produced.
    expect(only.refundableUnitPrice).not.toBe(
      refundableUnitValues(invoice, [outLine]).get('out-1'),
    );
  });
});

describe('ReturnEligibilityService.assertLineEligible', () => {
  let service: ReturnEligibilityService;
  let itemRepo: { find: jest.Mock; findOne: jest.Mock };

  beforeEach(async () => {
    itemRepo = { find: jest.fn(), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReturnEligibilityService,
        {
          provide: getRepositoryToken(InvoiceEntity),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(InvoiceDebtEntity),
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ReturnEligibilityService);
  });

  it('accepts an outbound line within its remaining cap', async () => {
    const item = line({ id: 'out-1', quantity: 2, returnedQuantity: 1 });
    itemRepo.findOne.mockResolvedValue(item);

    await expect(
      service.assertLineEligible('out-1', 1, actor),
    ).resolves.toBe(item);
  });

  it('refuses an inbound line — the customer already handed it back (AC-11)', async () => {
    itemRepo.findOne.mockResolvedValue(
      line({ id: 'in-1', direction: ItemDirection.IN, quantity: 1 }),
    );

    await expect(service.assertLineEligible('in-1', 1, actor)).rejects.toThrow(
      /inbound \(returned\) line/,
    );
  });

  it('names the direction, not the quantity, when a line fails both (AC-11)', async () => {
    itemRepo.findOne.mockResolvedValue(
      line({
        id: 'in-1',
        direction: ItemDirection.IN,
        quantity: 1,
        returnedQuantity: 1,
      }),
    );

    const err = await service
      .assertLineEligible('in-1', 99, actor)
      .catch((e: Error) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toContain('inbound (returned) line');
    expect((err as Error).message).not.toContain('max=');
  });
});
