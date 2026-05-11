import { Test, TestingModule } from '@nestjs/testing';
import { DomainEvent, DomainEventType, JournalSource } from '@erp/shared-interfaces';
import { JournalSaleConsumer } from './journal-sale.consumer';
import { JournalService } from '../journal/journal.service';
import { JournalPostSalePayload } from '../publishers/journal-sale.publisher';

const buildEvent = (
  overrides: Partial<JournalPostSalePayload> = {},
): DomainEvent<JournalPostSalePayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.JOURNAL_POST_SALE_REQUESTED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    code: 'INV-0001',
    branchId: 'branch-1',
    amountDue: 500,
    remainder: 0,
    revenueAccountId: 'acc-revenue',
    payments: [{ accountId: 'acc-cash', amount: 500 }],
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('JournalSaleConsumer', () => {
  let consumer: JournalSaleConsumer;
  let journalService: { post: jest.Mock; findBySourceRef: jest.Mock };

  beforeEach(async () => {
    journalService = {
      post: jest.fn().mockResolvedValue({}),
      findBySourceRef: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalSaleConsumer,
        { provide: JournalService, useValue: journalService },
      ],
    }).compile();

    consumer = module.get(JournalSaleConsumer);
  });

  it('posts journal with balanced lines (paid in full)', async () => {
    await consumer.handle(buildEvent());

    expect(journalService.post).toHaveBeenCalledTimes(1);
    const [dto] = journalService.post.mock.calls[0];
    expect(dto.source).toBe(JournalSource.SALE);
    expect(dto.sourceReferenceId).toBe('inv-1');
    expect(dto.lines).toEqual([
      { accountId: 'acc-cash', debitAmount: 500, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-revenue', debitAmount: 0, creditAmount: 500, lineOrder: 2 },
    ]);
  });

  it('adds AR line when remainder > 0', async () => {
    await consumer.handle(
      buildEvent({
        amountDue: 500,
        remainder: 200,
        receivableAccountId: 'acc-ar',
        payments: [{ accountId: 'acc-cash', amount: 300 }],
      }),
    );

    const [dto] = journalService.post.mock.calls[0];
    expect(dto.lines).toEqual([
      { accountId: 'acc-cash', debitAmount: 300, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-ar', debitAmount: 200, creditAmount: 0, lineOrder: 2 },
      { accountId: 'acc-revenue', debitAmount: 0, creditAmount: 500, lineOrder: 3 },
    ]);
  });

  it('skips when journal already posted (idempotency)', async () => {
    journalService.findBySourceRef.mockResolvedValue({
      id: 'je-1',
      documentNumber: 'JNL-001',
    });

    await consumer.handle(buildEvent());

    expect(journalService.post).not.toHaveBeenCalled();
  });

  it('throws when remainder > 0 but receivableAccountId is missing', async () => {
    await expect(
      consumer.handle(
        buildEvent({
          amountDue: 500,
          remainder: 200,
          receivableAccountId: undefined,
          payments: [{ accountId: 'acc-cash', amount: 300 }],
        }),
      ),
    ).rejects.toThrow(/receivableAccountId/);
  });

  it('propagates JournalService errors so Kafka retries', async () => {
    journalService.post.mockRejectedValue(new Error('account inactive'));

    await expect(consumer.handle(buildEvent())).rejects.toThrow('account inactive');
  });
});
