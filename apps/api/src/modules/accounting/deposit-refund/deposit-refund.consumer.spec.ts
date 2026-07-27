import { ConflictException } from '@nestjs/common';
import {
  DepositMovementSource,
  DomainEvent,
  DomainEventType,
} from '@erp/shared-interfaces';
import {
  InvoiceCancelledPayload,
  InvoiceCancelledRefundLeg,
} from '../../pos/publishers/invoice-cancelled.publisher';
import { BankPaymentsService } from '../deposit-vouchers/bank-payments/bank-payments.service';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
} from '../deposit-vouchers/enums';
import { DepositRefundConsumer } from './deposit-refund.consumer';

const depositLeg = (
  overrides: Partial<InvoiceCancelledRefundLeg> = {},
): InvoiceCancelledRefundLeg => ({
  invoicePaymentIds: ['pay-bank'],
  fundKind: 'DEPOSIT',
  depositAccountId: 'deposit-1',
  amount: 2_000_000,
  contraAccountId: 'coa-revenue',
  ...overrides,
});

const eventWith = (
  refunds: InvoiceCancelledRefundLeg[] | undefined,
  payloadOverrides: Partial<InvoiceCancelledPayload> = {},
): DomainEvent<InvoiceCancelledPayload> =>
  ({
    eventId: 'evt-1',
    eventType: DomainEventType.INVOICE_CANCELLED,
    timestamp: '2026-07-27T00:00:00Z',
    organizationId: 'org-1',
    branchId: 'branch-1',
    correlationId: 'inv-1',
    payload: {
      invoiceId: 'inv-1',
      documentNumber: 'HD001',
      reason: 'Khách hủy',
      branchId: 'branch-1',
      items: [],
      organizationId: 'org-1',
      actorId: 'user-1',
      refunds,
      ...payloadOverrides,
    },
  }) as DomainEvent<InvoiceCancelledPayload>;

describe('DepositRefundConsumer', () => {
  let consumer: DepositRefundConsumer;
  let bankPayments: { createAndPostInternal: jest.Mock };

  beforeEach(() => {
    bankPayments = {
      createAndPostInternal: jest.fn().mockResolvedValue({
        voucherId: 'unc-1',
        voucherNumber: 'UNC0001',
        depositMovementId: 'dm-1',
        journalEntryId: 'je-1',
      }),
    };
    consumer = new DepositRefundConsumer(
      bankPayments as unknown as BankPaymentsService,
    );
  });

  it('creates one posted bank payment on the fund that received the money', async () => {
    await consumer.handle(eventWith([depositLeg()]));

    expect(bankPayments.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(bankPayments.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: BankPaymentPurpose.REFUND,
        depositAccountId: 'deposit-1',
        contraAccountId: 'coa-revenue',
        amount: 2_000_000,
        referenceType: BankPaymentReferenceType.INVOICE,
        referenceId: 'inv-1',
        source: DepositMovementSource.POS_INVOICE,
        sourceRefLineId: 'deposit-1-CANCEL',
      }),
    );
  });

  it('offsets the sale movement with a new withdrawal rather than reversing it', async () => {
    // ADR-04: nothing here touches the original movement, so a reconciled one
    // (BR-REF-02, which used to block the cancel) is no longer in the way.
    await consumer.handle(eventWith([depositLeg()]));

    const args = bankPayments.createAndPostInternal.mock.calls[0][0];
    expect(args.sourceRefLineId).toContain('CANCEL');
    expect(args.amount).toBe(2_000_000);
  });

  it('refuses to refund an invoice split across two deposit funds (ADR-06)', async () => {
    await expect(
      consumer.handle(
        eventWith([
          depositLeg({ depositAccountId: 'deposit-1', amount: 1_000_000 }),
          depositLeg({ depositAccountId: 'deposit-2', amount: 500_000 }),
        ]),
      ),
    ).rejects.toThrow(ConflictException);

    expect(bankPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('does nothing for a cash-only invoice', async () => {
    await consumer.handle(
      eventWith([
        {
          invoicePaymentIds: ['pay-cash'],
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 500_000,
          contraAccountId: 'coa-revenue',
        },
      ]),
    );

    expect(bankPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('does nothing on an event published before refunds existed', async () => {
    await consumer.handle(eventWith(undefined));

    expect(bankPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('skips events with no branchId', async () => {
    await consumer.handle(eventWith([depositLeg()], { branchId: undefined }));

    expect(bankPayments.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('relies on the service for replay safety, keying on the same reference', async () => {
    const event = eventWith([depositLeg()]);
    await consumer.handle(event);
    await consumer.handle(event);

    const [first, second] = bankPayments.createAndPostInternal.mock.calls;
    expect(first[0].referenceId).toBe(second[0].referenceId);
    expect(first[0].sourceRefLineId).toBe(second[0].sourceRefLineId);
  });

  it('re-throws a BR-LOCK-01 block so the DLQ machinery retries/dead-letters it', async () => {
    bankPayments.createAndPostInternal.mockRejectedValue(
      new ConflictException('Period 2026-07 is locked (BR-LOCK-01)'),
    );

    await expect(consumer.handle(eventWith([depositLeg()]))).rejects.toThrow(
      /BR-LOCK-01/,
    );
  });

  it('throws when a deposit leg carries no fund', async () => {
    await expect(
      consumer.handle(eventWith([depositLeg({ depositAccountId: undefined })])),
    ).rejects.toThrow(/without depositAccountId/);
  });
});
