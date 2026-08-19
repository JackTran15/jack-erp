import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
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

  it('reverses nothing when the payload says 0 points, however much money moved (QA #16)', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 7_575 });

    await consumer.handle(buildEvent({ subtotalDelta: 800_000, points: 0 }));

    // The card is untouched: the sale earned nothing because a promotion blocked
    // accrual, so there is nothing to claw back. Deriving from the 800.000đ would
    // take 80 points the customer never had.
    expect(manager.decrement).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    // The NO-OP row still goes in — it is what the replay guard keys on.
    expect(historyRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: PointType.ADJUST, delta: 0 }),
    );
  });

  it('uses the payload point count verbatim rather than re-deriving it from money', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 500 });

    await consumer.handle(buildEvent({ subtotalDelta: 464_000, points: 46 }));

    expect(manager.decrement).toHaveBeenCalledWith(
      MembershipCardEntity,
      { id: 'card-1' },
      'points',
      46,
    );
    expect(manager.insert).toHaveBeenCalledWith(
      PointHistoryEntity,
      expect.objectContaining({ type: PointType.ADJUST, delta: -46 }),
    );
  });

  it('falls back to the money derivation for an event published before `points` existed', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 500 });

    // An event already sitting in the topic at deploy time carries no `points` key.
    const event = buildEvent({ subtotalDelta: 464_000 });
    expect(event.payload.points).toBeUndefined();

    await consumer.handle(event);

    expect(manager.decrement).toHaveBeenCalledWith(
      MembershipCardEntity,
      { id: 'card-1' },
      'points',
      46,
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

  it('scopes the idempotency lookup to its own negative ADJUST rows so a redeemed-points refund does not block the reversal', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    cardRepo.findOne.mockResolvedValue({ id: 'card-1', points: 500 });

    await consumer.handle(buildEvent());

    expect(historyRepo.findOne).toHaveBeenCalledWith({
      where: {
        invoiceId: 'ret-1',
        organizationId: 'org-1',
        type: PointType.ADJUST,
        delta: LessThanOrEqual(0),
      },
    });
  });

  it('skips when the return already has loyalty history (idempotency)', async () => {
    historyRepo.findOne.mockResolvedValue({ id: 'ph-1' });

    await consumer.handle(buildEvent());

    expect(cardRepo.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
