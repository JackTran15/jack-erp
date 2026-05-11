import { Test, TestingModule } from '@nestjs/testing';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import { JournalReverseConsumer } from './journal-reverse.consumer';
import { JournalService } from '../journal/journal.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';

const buildEvent = (
  overrides: Partial<InvoiceCancelledPayload> = {},
): DomainEvent<InvoiceCancelledPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.INVOICE_CANCELLED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    documentNumber: 'INV-001',
    reason: 'mistake',
    branchId: 'branch-1',
    items: [],
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('JournalReverseConsumer', () => {
  let consumer: JournalReverseConsumer;
  let journalService: { findBySourceRef: jest.Mock; reverse: jest.Mock };

  beforeEach(async () => {
    journalService = {
      findBySourceRef: jest.fn(),
      reverse: jest.fn().mockResolvedValue({ id: 'rev-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalReverseConsumer,
        { provide: JournalService, useValue: journalService },
      ],
    }).compile();

    consumer = module.get(JournalReverseConsumer);
  });

  it('reverses the journal entry when a POSTED entry exists', async () => {
    journalService.findBySourceRef.mockResolvedValue({
      id: 'je-1',
      documentNumber: 'JNL-001',
    });

    await consumer.handle(buildEvent());

    expect(journalService.reverse).toHaveBeenCalledWith(
      'je-1',
      'mistake',
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      }),
    );
  });

  it('skips when no POSTED journal entry found (already reversed or never posted)', async () => {
    journalService.findBySourceRef.mockResolvedValue(null);

    await consumer.handle(buildEvent());

    expect(journalService.reverse).not.toHaveBeenCalled();
  });

  it('propagates errors so Kafka retries', async () => {
    journalService.findBySourceRef.mockResolvedValue({ id: 'je-1', documentNumber: 'JNL-001' });
    journalService.reverse.mockRejectedValue(new Error('locked'));

    await expect(consumer.handle(buildEvent())).rejects.toThrow('locked');
  });
});
