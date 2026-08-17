import { Test, TestingModule } from '@nestjs/testing';
import {
  DomainEvent,
  DomainEventType,
  JournalSource,
  RefundMethod,
} from '@erp/shared-interfaces';
import { JournalReturnConsumer } from './journal-return.consumer';
import { JournalService } from '../journal/journal.service';
import { JournalPostReturnPayload } from '../publishers/journal-return.publisher';

const buildEvent = (
  overrides: Partial<JournalPostReturnPayload> = {},
): DomainEvent<JournalPostReturnPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.JOURNAL_POST_RETURN_REQUESTED,
  timestamp: '2026-07-13T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'ret-1',
  payload: {
    returnInvoiceId: 'ret-1',
    returnInvoiceCode: 'RTN-0001',
    source: 'EXCHANGE',
    refundMethod: RefundMethod.CASH,
    refundedAmount: 0,
    netAmount: 30000,
    debtAmount: 30000,
    revenueAccountId: 'acc-revenue',
    receivableAccountId: 'acc-ar',
    branchId: 'branch-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('JournalReturnConsumer', () => {
  let consumer: JournalReturnConsumer;
  let journalService: { post: jest.Mock; findBySourceRef: jest.Mock };

  beforeEach(async () => {
    journalService = {
      post: jest.fn().mockResolvedValue({}),
      findBySourceRef: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalReturnConsumer,
        { provide: JournalService, useValue: journalService },
      ],
    }).compile();

    consumer = module.get(JournalReturnConsumer);
  });

  it('posts DR receivable / CR revenue for a fully-debt EXCHANGE net > 0 (no cash leg)', async () => {
    await consumer.handle(buildEvent());

    expect(journalService.post).toHaveBeenCalledTimes(1);
    const [dto] = journalService.post.mock.calls[0];
    expect(dto.source).toBe(JournalSource.EXCHANGE);
    expect(dto.lines).toEqual([
      { accountId: 'acc-ar', debitAmount: 30000, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-revenue', debitAmount: 0, creditAmount: 30000, lineOrder: 2 },
    ]);
  });

  it('books only the debt portion on a partial top-up (cash portion handled elsewhere)', async () => {
    await consumer.handle(buildEvent({ debtAmount: 10000 }));

    const [dto] = journalService.post.mock.calls[0];
    expect(dto.lines).toEqual([
      { accountId: 'acc-ar', debitAmount: 10000, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-revenue', debitAmount: 0, creditAmount: 10000, lineOrder: 2 },
    ]);
  });

  it('posts nothing when the net > 0 exchange is paid in full (no double revenue)', async () => {
    await consumer.handle(buildEvent({ debtAmount: 0 }));

    expect(journalService.post).not.toHaveBeenCalled();
  });

  it('throws when net > 0 has debt but no receivableAccountId', async () => {
    await expect(
      consumer.handle(buildEvent({ receivableAccountId: undefined })),
    ).rejects.toThrow(/receivableAccountId/);
  });

  it('posts nothing for a CASH refund — the cash movement owns the JE (no double-post)', async () => {
    await consumer.handle(
      buildEvent({
        source: 'RETURN',
        refundMethod: RefundMethod.CASH,
        refundedAmount: 200,
        netAmount: -200,
        debtAmount: 0,
        cashAccountId: 'acc-cash',
      }),
    );

    expect(journalService.post).not.toHaveBeenCalled();
  });

  it('posts nothing for a BANK refund — the deposit movement owns the JE (no double-post)', async () => {
    await consumer.handle(
      buildEvent({
        source: 'RETURN',
        refundMethod: RefundMethod.BANK,
        refundedAmount: 200,
        netAmount: -200,
        debtAmount: 0,
      }),
    );

    expect(journalService.post).not.toHaveBeenCalled();
  });

  it('posts DR revenue / CR credit_liability for a STORE_CREDIT refund (net < 0)', async () => {
    await consumer.handle(
      buildEvent({
        source: 'RETURN',
        refundMethod: RefundMethod.STORE_CREDIT,
        refundedAmount: 200,
        netAmount: -200,
        debtAmount: 0,
        creditLiabilityAccountId: 'acc-credit',
      }),
    );

    const [dto] = journalService.post.mock.calls[0];
    expect(dto.source).toBe(JournalSource.RETURN);
    expect(dto.lines).toEqual([
      { accountId: 'acc-revenue', debitAmount: 200, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-credit', debitAmount: 0, creditAmount: 200, lineOrder: 2 },
    ]);
  });

  it('posts DR revenue / CR receivable for an OFFSET refund (net < 0)', async () => {
    await consumer.handle(
      buildEvent({
        source: 'RETURN',
        refundMethod: RefundMethod.OFFSET,
        refundedAmount: 200,
        netAmount: -200,
        debtAmount: 0,
        receivableAccountId: 'acc-ar',
      }),
    );

    const [dto] = journalService.post.mock.calls[0];
    expect(dto.source).toBe(JournalSource.RETURN);
    expect(dto.lines).toEqual([
      { accountId: 'acc-revenue', debitAmount: 200, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-ar', debitAmount: 0, creditAmount: 200, lineOrder: 2 },
    ]);
  });

  it('skips when the journal was already posted (idempotency)', async () => {
    journalService.findBySourceRef.mockResolvedValue({
      id: 'je-1',
      documentNumber: 'JNL-001',
    });

    await consumer.handle(buildEvent());

    expect(journalService.post).not.toHaveBeenCalled();
  });
  describe('debt-first refund split (AC-11)', () => {
    /** RETURN of 765.000: 465.000 settled the debt, 300.000 left the till. */
    const splitEvent = () =>
      buildEvent({
        source: 'RETURN',
        refundMethod: RefundMethod.CASH,
        refundedAmount: 765000,
        offsetAmount: 465000,
        netAmount: -765000,
        debtAmount: 0,
      });

    it('books only the offset part — the cash part belongs to the treasury movement', async () => {
      await consumer.handle(splitEvent());

      const { lines, source } = journalService.post.mock.calls[0][0];
      expect(source).toBe(JournalSource.RETURN);
      expect(lines).toHaveLength(2);
      expect(lines).toEqual([
        expect.objectContaining({
          accountId: 'acc-revenue',
          debitAmount: 465000,
          creditAmount: 0,
        }),
        expect.objectContaining({
          accountId: 'acc-ar',
          debitAmount: 0,
          creditAmount: 465000,
        }),
      ]);
      // The 300.000 that actually moved is nowhere in this entry — booking it here
      // as well is exactly the double-post this split has to avoid.
      const amounts = lines.flatMap((l: any) => [l.debitAmount, l.creditAmount]);
      expect(amounts).not.toContain(765000);
      expect(amounts).not.toContain(300000);
    });

    it('balances debits against credits', async () => {
      await consumer.handle(splitEvent());

      const { lines } = journalService.post.mock.calls[0][0];
      const dr = lines.reduce((s: number, l: any) => s + l.debitAmount, 0);
      const cr = lines.reduce((s: number, l: any) => s + l.creditAmount, 0);
      expect(dr).toBe(cr);
    });

    it('books the whole refund when the debt swallowed all of it', async () => {
      await consumer.handle(
        buildEvent({
          source: 'RETURN',
          refundMethod: RefundMethod.CASH,
          refundedAmount: 765000,
          offsetAmount: 765000,
          netAmount: -765000,
          debtAmount: 0,
        }),
      );

      const { lines } = journalService.post.mock.calls[0][0];
      expect(lines).toEqual([
        expect.objectContaining({ debitAmount: 765000, creditAmount: 0 }),
        expect.objectContaining({ debitAmount: 0, creditAmount: 765000 }),
      ]);
    });

    it('posts nothing when no part of the refund settled debt', async () => {
      await consumer.handle(
        buildEvent({
          source: 'RETURN',
          refundMethod: RefundMethod.CASH,
          refundedAmount: 765000,
          offsetAmount: 0,
          netAmount: -765000,
          debtAmount: 0,
        }),
      );

      expect(journalService.post).not.toHaveBeenCalled();
    });

    it('throws when an offset arrives without a receivable account', async () => {
      await expect(
        consumer.handle(
          buildEvent({
            source: 'RETURN',
            refundMethod: RefundMethod.CASH,
            refundedAmount: 765000,
            offsetAmount: 465000,
            netAmount: -765000,
            debtAmount: 0,
            receivableAccountId: undefined,
          }),
        ),
      ).rejects.toThrow(/receivableAccountId/);
    });

    it('falls back to the legacy OFFSET reading for events published before the split', async () => {
      // No `offsetAmount` on the payload at all — an event already in the topic.
      await consumer.handle(
        buildEvent({
          source: 'RETURN',
          refundMethod: RefundMethod.OFFSET,
          refundedAmount: 500000,
          netAmount: -500000,
          debtAmount: 0,
        }),
      );

      const { lines } = journalService.post.mock.calls[0][0];
      expect(lines).toEqual([
        expect.objectContaining({ debitAmount: 500000, creditAmount: 0 }),
        expect.objectContaining({
          accountId: 'acc-ar',
          debitAmount: 0,
          creditAmount: 500000,
        }),
      ]);
    });

    it('keeps STORE_CREDIT on its liability leg, untouched by the split', async () => {
      await consumer.handle(
        buildEvent({
          source: 'RETURN',
          refundMethod: RefundMethod.STORE_CREDIT,
          refundedAmount: 400000,
          netAmount: -400000,
          debtAmount: 0,
          creditLiabilityAccountId: 'acc-credit',
        }),
      );

      const { lines } = journalService.post.mock.calls[0][0];
      expect(lines).toEqual([
        expect.objectContaining({
          accountId: 'acc-revenue',
          debitAmount: 400000,
        }),
        expect.objectContaining({
          accountId: 'acc-credit',
          creditAmount: 400000,
        }),
      ]);
    });
  });
});
