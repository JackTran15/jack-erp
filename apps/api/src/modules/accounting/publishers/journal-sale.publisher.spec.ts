import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { JournalSalePublisher } from './journal-sale.publisher';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

describe('JournalSalePublisher', () => {
  let publisher: JournalSalePublisher;
  let eventPublisher: { publish: jest.Mock };

  beforeEach(async () => {
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalSalePublisher,
        { provide: EventPublisher, useValue: eventPublisher },
      ],
    }).compile();

    publisher = module.get(JournalSalePublisher);
  });

  it('publishes with branchId as Kafka key', async () => {
    await publisher.publish(
      {
        invoiceId: 'inv-1',
        code: 'INV-0001',
        branchId: 'branch-1',
        amountDue: 500,
        remainder: 0,
        revenueAccountId: 'acc-revenue',
        payments: [{ accountId: 'acc-cash', amount: 500 }],
      },
      actor,
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, event, key] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe(ERP_TOPICS.JOURNAL_POST_SALE);
    expect(event.eventType).toBe(DomainEventType.JOURNAL_POST_SALE_REQUESTED);
    expect(event.payload).toMatchObject({
      invoiceId: 'inv-1',
      code: 'INV-0001',
      amountDue: 500,
      remainder: 0,
      revenueAccountId: 'acc-revenue',
      payments: [{ accountId: 'acc-cash', amount: 500 }],
    });
    expect(key).toBe('branch-1');
  });

  it('falls back to invoiceId as key when branchId is undefined', async () => {
    await publisher.publish(
      {
        invoiceId: 'inv-2',
        code: 'INV-0002',
        amountDue: 100,
        remainder: 0,
        revenueAccountId: 'acc-revenue',
        payments: [],
      },
      actor,
    );

    const [, , key] = eventPublisher.publish.mock.calls[0];
    expect(key).toBe('inv-2');
  });
});
