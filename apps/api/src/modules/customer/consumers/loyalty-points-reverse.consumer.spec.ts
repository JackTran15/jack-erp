import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import { LoyaltyPointsReverseConsumer } from './loyalty-points-reverse.consumer';
import { MembershipCardEntity } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import { LoyaltyPointsReversePayload } from '../publishers/loyalty-points-reverse.publisher';

const buildEvent = (
  overrides: Partial<LoyaltyPointsReversePayload> = {},
): DomainEvent<LoyaltyPointsReversePayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.LOYALTY_POINTS_REVERSE_REQUESTED,
  timestamp: '2026-06-03T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'ret-1',
  payload: {
    returnInvoiceId: 'ret-1',
    customerId: 'cust-1',
    subtotalDelta: 1_000_000,
    branchId: 'branch-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('LoyaltyPointsReverseConsumer', () => {
  let consumer: LoyaltyPointsReverseConsumer;
  let historyRepo: { findOne: jest.Mock; insert: jest.Mock };
  let cardRepo: { findOne: jest.Mock };
  let manager: { decrement: jest.Mock; insert: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    historyRepo = { findOne: jest.fn(), insert: jest.fn() };
    cardRepo = { findOne: jest.fn() };
    manager = { decrement: jest.fn(), insert: jest.fn() };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyPointsReverseConsumer,
        { provide: getRepositoryToken(PointHistoryEntity), useValue: historyRepo },
        { provide: getRepositoryToken(MembershipCardEntity), useValue: cardRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    consumer = module.get(LoyaltyPointsReverseConsumer);
  });

  it('reverses floor(|subtotalDelta| / 10000) points — 1.000.000đ return reverses 100', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 500 });

    await consumer.handle(buildEvent());

    expect(manager.decrement).toHaveBeenCalledWith(
      MembershipCardEntity,
      { id: 'card-1' },
      'points',
      100,
    );
    expect(manager.insert).toHaveBeenCalledWith(
      PointHistoryEntity,
      expect.objectContaining({ type: PointType.ADJUST, delta: -100 }),
    );
  });

  it('caps the reversal at the available balance', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 40 });

    await consumer.handle(buildEvent());

    expect(manager.decrement).toHaveBeenCalledWith(
      MembershipCardEntity,
      { id: 'card-1' },
      'points',
      40,
    );
  });

  it('skips when the return already has loyalty history (idempotency)', async () => {
    historyRepo.findOne.mockResolvedValue({ id: 'ph-1' });

    await consumer.handle(buildEvent());

    expect(cardRepo.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
