import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainEvent, DomainEventType } from '@erp/shared-interfaces';
import { CashFromPaymentConsumer } from './cash-from-payment.consumer';
import { CashService } from '../cash/cash.service';
import {
  CashMovementEntity,
  CashMovementType,
} from '../cash/cash-movement.entity';
import { CashMovementFromPaymentPayload } from '../publishers/cash-from-payment.publisher';

const buildEvent = (
  overrides: Partial<CashMovementFromPaymentPayload> = {},
): DomainEvent<CashMovementFromPaymentPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.CASH_MOVEMENT_FROM_PAYMENT_REQUESTED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    invoicePaymentId: 'pay-1',
    invoiceCode: 'INV-0001',
    sessionId: 'session-1',
    cashAccountId: 'cash-1',
    contraAccountId: 'gl-revenue',
    amount: 300,
    branchId: 'branch-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('CashFromPaymentConsumer', () => {
  let consumer: CashFromPaymentConsumer;
  let movementRepo: { findOne: jest.Mock };
  let cashService: { recordMovement: jest.Mock };

  beforeEach(async () => {
    movementRepo = { findOne: jest.fn() };
    cashService = { recordMovement: jest.fn().mockResolvedValue({ id: 'mv-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFromPaymentConsumer,
        { provide: getRepositoryToken(CashMovementEntity), useValue: movementRepo },
        { provide: CashService, useValue: cashService },
      ],
    }).compile();

    consumer = module.get(CashFromPaymentConsumer);
  });

  it('records DEPOSIT movement when none exists', async () => {
    movementRepo.findOne.mockResolvedValue(null);

    await consumer.handle(buildEvent());

    expect(cashService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        cashAccountId: 'cash-1',
        type: CashMovementType.DEPOSIT,
        amount: 300,
        contraAccountId: 'gl-revenue',
        reference: 'INV-0001',
      }),
      expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }),
    );
  });

  it('skips when a movement already exists for the same invoice + cash account (idempotency)', async () => {
    movementRepo.findOne.mockResolvedValue({ id: 'existing-mv' });

    await consumer.handle(buildEvent());

    expect(cashService.recordMovement).not.toHaveBeenCalled();
  });

  it('propagates errors so Kafka retries', async () => {
    movementRepo.findOne.mockResolvedValue(null);
    cashService.recordMovement.mockRejectedValue(new Error('insufficient'));

    await expect(consumer.handle(buildEvent())).rejects.toThrow('insufficient');
  });
});
