import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import { LoyaltyPointsConsumer } from './loyalty-points.consumer';
import { MembershipCardService } from '../services/membership-card.service';
import { PointHistoryEntity } from '../point-history.entity';
import { LoyaltyPointsAwardPayload } from '../publishers/loyalty-points.publisher';

const buildEvent = (
  overrides: Partial<LoyaltyPointsAwardPayload> = {},
): DomainEvent<LoyaltyPointsAwardPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.LOYALTY_POINTS_AWARD_REQUESTED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    customerId: 'cust-1',
    subtotal: 5000,
    branchId: 'branch-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('LoyaltyPointsConsumer', () => {
  let consumer: LoyaltyPointsConsumer;
  let historyRepo: { findOne: jest.Mock };
  let membershipCardService: { awardPointsForInvoice: jest.Mock };

  beforeEach(async () => {
    historyRepo = { findOne: jest.fn() };
    membershipCardService = { awardPointsForInvoice: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyPointsConsumer,
        { provide: getRepositoryToken(PointHistoryEntity), useValue: historyRepo },
        { provide: MembershipCardService, useValue: membershipCardService },
      ],
    }).compile();

    consumer = module.get(LoyaltyPointsConsumer);
  });

  it('awards points when no prior history exists for the invoice', async () => {
    historyRepo.findOne.mockResolvedValue(null);

    await consumer.handle(buildEvent());

    expect(membershipCardService.awardPointsForInvoice).toHaveBeenCalledWith(
      { id: 'inv-1', customerId: 'cust-1', subtotal: 5000 },
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
    );
  });

  it('skips when point_history already has invoice (idempotency)', async () => {
    historyRepo.findOne.mockResolvedValue({ id: 'ph-1' });

    await consumer.handle(buildEvent());

    expect(membershipCardService.awardPointsForInvoice).not.toHaveBeenCalled();
  });

  it('propagates errors so Kafka retries', async () => {
    historyRepo.findOne.mockResolvedValue(null);
    membershipCardService.awardPointsForInvoice.mockRejectedValue(new Error('db down'));

    await expect(consumer.handle(buildEvent())).rejects.toThrow('db down');
  });
});
