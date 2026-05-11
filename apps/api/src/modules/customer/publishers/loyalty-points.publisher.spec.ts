import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { LoyaltyPointsPublisher } from './loyalty-points.publisher';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

describe('LoyaltyPointsPublisher', () => {
  let publisher: LoyaltyPointsPublisher;
  let eventPublisher: { publish: jest.Mock };

  beforeEach(async () => {
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyPointsPublisher,
        { provide: EventPublisher, useValue: eventPublisher },
      ],
    }).compile();

    publisher = module.get(LoyaltyPointsPublisher);
  });

  it('publishes with customerId as key when customer present', async () => {
    const result = await publisher.publish(
      { invoiceId: 'inv-1', customerId: 'cust-1', subtotal: 5000, branchId: 'branch-1' },
      actor,
    );

    expect(result).toBe(true);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    const [topic, event, key] = eventPublisher.publish.mock.calls[0];
    expect(topic).toBe(ERP_TOPICS.LOYALTY_POINTS_AWARD);
    expect(event.eventType).toBe(DomainEventType.LOYALTY_POINTS_AWARD_REQUESTED);
    expect(event.payload).toMatchObject({
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      subtotal: 5000,
    });
    expect(key).toBe('cust-1');
  });

  it('skips publishing when customerId is missing', async () => {
    const result = await publisher.publish(
      { invoiceId: 'inv-1', customerId: null, subtotal: 5000 },
      actor,
    );

    expect(result).toBe(false);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
