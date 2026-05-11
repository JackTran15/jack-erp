import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { CashFromPaymentPublisher } from './cash-from-payment.publisher';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

describe('CashFromPaymentPublisher', () => {
  let publisher: CashFromPaymentPublisher;
  let eventPublisher: { publish: jest.Mock };

  beforeEach(async () => {
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFromPaymentPublisher,
        { provide: EventPublisher, useValue: eventPublisher },
      ],
    }).compile();

    publisher = module.get(CashFromPaymentPublisher);
  });

  it('publishes with cashAccountId as Kafka key', async () => {
    await publisher.publish(
      {
        invoiceId: 'inv-1',
        invoicePaymentId: 'pay-1',
        invoiceCode: 'INV-0001',
        sessionId: 'session-1',
        cashAccountId: 'cash-1',
        contraAccountId: 'gl-revenue',
        amount: 300,
        branchId: 'branch-1',
      },
      actor,
    );

    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, event, key] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe(ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT);
    expect(event.eventType).toBe(DomainEventType.CASH_MOVEMENT_FROM_PAYMENT_REQUESTED);
    expect(event.payload).toMatchObject({
      invoiceId: 'inv-1',
      invoiceCode: 'INV-0001',
      cashAccountId: 'cash-1',
      contraAccountId: 'gl-revenue',
      amount: 300,
      sessionId: 'session-1',
    });
    expect(key).toBe('cash-1');
  });
});
