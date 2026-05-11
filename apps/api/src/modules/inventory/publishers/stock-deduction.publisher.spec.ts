import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import {
  StockDeductionPublisher,
  StockDeductionItem,
} from './stock-deduction.publisher';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['staff'],
};

describe('StockDeductionPublisher', () => {
  let publisher: StockDeductionPublisher;
  let eventPublisher: { publish: jest.Mock };

  beforeEach(async () => {
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockDeductionPublisher,
        { provide: EventPublisher, useValue: eventPublisher },
      ],
    }).compile();

    publisher = module.get(StockDeductionPublisher);
  });

  it('publishes one event per item with itemId as key', async () => {
    const items: StockDeductionItem[] = [
      { itemId: 'item-A', locationId: 'loc-1', quantity: 2 },
      { itemId: 'item-B', locationId: 'loc-1', quantity: 1 },
    ];

    await publisher.publish('inv-1', items, 'branch-1', actor);

    expect(eventPublisher.publish).toHaveBeenCalledTimes(2);

    const firstCall = eventPublisher.publish.mock.calls[0];
    expect(firstCall[0]).toBe(ERP_TOPICS.STOCK_DEDUCTION);
    expect(firstCall[1].eventType).toBe(DomainEventType.STOCK_DEDUCTION_REQUESTED);
    expect(firstCall[1].correlationId).toBe('inv-1');
    expect(firstCall[1].payload).toMatchObject({
      invoiceId: 'inv-1',
      itemId: 'item-A',
      locationId: 'loc-1',
      quantity: 2,
      branchId: 'branch-1',
      actorId: 'user-1',
    });
    expect(firstCall[2]).toBe('item-A');

    const secondCall = eventPublisher.publish.mock.calls[1];
    expect(secondCall[2]).toBe('item-B');
  });

  it('publishes nothing when items array is empty', async () => {
    await publisher.publish('inv-1', [], 'branch-1', actor);
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });
});
