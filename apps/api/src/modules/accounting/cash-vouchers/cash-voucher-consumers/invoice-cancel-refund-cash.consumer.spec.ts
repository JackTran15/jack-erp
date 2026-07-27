import { Test, TestingModule } from '@nestjs/testing';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import {
  InvoiceCancelledPayload,
  InvoiceCancelledRefundLeg,
} from '../../../pos/publishers/invoice-cancelled.publisher';
import { DataSource } from 'typeorm';
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import { CashPaymentPurpose, CashPaymentReferenceType } from '../enums';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';
import {
  VoucherLinkKind,
  VoucherLinkRelation,
} from '../../voucher-links/enums';
import { VoucherLinksService } from '../../voucher-links/voucher-links.service';
import { InvoiceCancelRefundCashConsumer } from './invoice-cancel-refund-cash.consumer';

const cashLeg = (
  overrides: Partial<InvoiceCancelledRefundLeg> = {},
): InvoiceCancelledRefundLeg => ({
  invoicePaymentIds: ['pay-1'],
  fundKind: 'CASH',
  cashAccountId: 'cash-fund-1',
  amount: 1_000_000,
  contraAccountId: 'coa-revenue',
  ...overrides,
});

const eventWith = (
  refunds: InvoiceCancelledRefundLeg[] | undefined,
): DomainEvent<InvoiceCancelledPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.INVOICE_CANCELLED,
  timestamp: new Date().toISOString(),
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    documentNumber: 'HD001',
    reason: 'khách đổi ý',
    branchId: 'branch-1',
    items: [],
    organizationId: 'org-1',
    actorId: 'user-1',
    refunds,
  },
});

describe('InvoiceCancelRefundCashConsumer', () => {
  let consumer: InvoiceCancelRefundCashConsumer;
  let cashPaymentsService: { createAndPostInternal: jest.Mock };
  let categoryResolver: { resolveId: jest.Mock };
  let voucherLinks: { link: jest.Mock };
  let manager: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    cashPaymentsService = {
      createAndPostInternal: jest.fn().mockResolvedValue({
        voucherId: 'pc-1',
        voucherNumber: 'PC0001',
        cashMovementId: 'mv-1',
        journalEntryId: 'je-1',
      }),
    };
    categoryResolver = { resolveId: jest.fn().mockResolvedValue('cat-chi-khac') };
    voucherLinks = { link: jest.fn().mockResolvedValue({ id: 'link-1' }) };
    manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceCancelRefundCashConsumer,
        { provide: DataSource, useValue: dataSource },
        { provide: CashPaymentsService, useValue: cashPaymentsService },
        {
          provide: CashVoucherCategoryResolverService,
          useValue: categoryResolver,
        },
        { provide: VoucherLinksService, useValue: voucherLinks },
      ],
    }).compile();

    consumer = module.get(InvoiceCancelRefundCashConsumer);
  });

  it('creates one posted cash payment for the cash refund leg', async () => {
    await consumer.handle(eventWith([cashLeg()]));

    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CashPaymentPurpose.REFUND,
        cashAccountId: 'cash-fund-1',
        contraAccountId: 'coa-revenue',
        amount: 1_000_000,
        referenceType: CashPaymentReferenceType.REFUND,
        referenceId: 'inv-1',
        categoryId: 'cat-chi-khac',
      }),
      manager,
    );
  });

  it('refunds the amount on the leg, which is what was collected', async () => {
    await consumer.handle(eventWith([cashLeg({ amount: 600_000 })]));

    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 600_000 }),
      manager,
    );
  });

  it('references the cancelled invoice in the description', async () => {
    await consumer.handle(eventWith([cashLeg()]));

    const args = cashPaymentsService.createAndPostInternal.mock.calls[0][0];
    expect(args.description).toContain('HD001');
  });

  it('leans on createAndPostInternal for replay safety instead of a second guard', async () => {
    // Same voucher returned on the replay — the service dedupes on
    // (referenceType, referenceId), so the consumer may call it again freely.
    const event = eventWith([cashLeg()]);
    await consumer.handle(event);
    await consumer.handle(event);

    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledTimes(2);
    const [first, second] = cashPaymentsService.createAndPostInternal.mock.calls;
    expect(first[0].referenceId).toBe(second[0].referenceId);
    expect(first[0].referenceType).toBe(second[0].referenceType);
  });

  it('does nothing when there is no cash leg', async () => {
    await consumer.handle(
      eventWith([cashLeg({ fundKind: 'DEPOSIT', cashAccountId: undefined })]),
    );

    expect(cashPaymentsService.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('does nothing on an event published before refunds existed', async () => {
    await consumer.handle(eventWith(undefined));

    expect(cashPaymentsService.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('lets a failure from the voucher service escape to the DLQ', async () => {
    cashPaymentsService.createAndPostInternal.mockRejectedValue(
      new Error('Insufficient cash balance'),
    );

    await expect(consumer.handle(eventWith([cashLeg()]))).rejects.toThrow(
      'Insufficient cash balance',
    );
  });

  it('links the original POS_SALE receipt to the refund voucher', async () => {
    await consumer.handle(eventWith([cashLeg()]));

    expect(voucherLinks.link).toHaveBeenCalledWith(
      expect.objectContaining({
        fromKind: VoucherLinkKind.CASH_RECEIPT,
        fromId: 'receipt-1',
        toKind: VoucherLinkKind.CASH_PAYMENT,
        toId: 'pc-1',
        relation: VoucherLinkRelation.REFUNDED_BY,
        invoiceId: 'inv-1',
      }),
      manager,
    );
  });

  it('writes voucher and link in the same transaction', async () => {
    await consumer.handle(eventWith([cashLeg()]));

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledWith(
      expect.anything(),
      manager,
    );
    expect(voucherLinks.link).toHaveBeenCalledWith(expect.anything(), manager);
  });

  it('ignores a reversed receipt when looking for the original', async () => {
    await consumer.handle(eventWith([cashLeg()]));

    const where = manager.findOne.mock.calls[0][1].where;
    expect(where.referenceId).toBe('inv-1');
    expect(where.status).toBeDefined();
  });

  it('still creates the refund voucher when no original receipt exists', async () => {
    manager.findOne.mockResolvedValue(null);

    await consumer.handle(eventWith([cashLeg()]));

    expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(voucherLinks.link).not.toHaveBeenCalled();
  });

  it('throws when a cash leg carries no cash fund', async () => {
    await expect(
      consumer.handle(eventWith([cashLeg({ cashAccountId: undefined })])),
    ).rejects.toThrow(/without cashAccountId/);
  });
});
