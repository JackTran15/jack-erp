import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainEvent, TargetFund } from '@erp/shared-interfaces';
import { PosDepositSaleConsumer } from './pos-deposit-sale.consumer';
import { DepositService } from '../deposit.service';
import { DepositRoutingService } from '../deposit-routing.service';
import { DepositFeeService } from '../../deposit-fee/deposit-fee.service';
import { DepositPeriodGuardService } from '../../deposit-period-lock/deposit-period-guard.service';
import { DepositAuditService } from '../../deposit-audit/deposit-audit.service';
import { EventPublisher } from '../../../events/event-publisher.service';
import { DepositMovementFromPaymentPayload } from '../deposit-from-payment.publisher';

function event(
  over: Partial<DepositMovementFromPaymentPayload> = {},
): DomainEvent<DepositMovementFromPaymentPayload> {
  return {
    payload: {
      invoiceId: 'inv1',
      invoicePaymentId: 'pay1',
      invoiceCode: 'HD001',
      paymentMethod: 'card',
      resolvedAccountId: 'coa-112',
      contraAccountId: 'coa-rev',
      amount: 1135000,
      docDate: '2026-07-15',
      branchId: 'br1',
      organizationId: 'org1',
      actorId: 'u1',
      ...over,
    },
  } as DomainEvent<DepositMovementFromPaymentPayload>;
}

describe('PosDepositSaleConsumer', () => {
  let consumer: PosDepositSaleConsumer;
  let deposit: { createAndPostInternal: jest.Mock };
  let routing: { resolveDepositTarget: jest.Mock };
  let depositFee: { computeFee: jest.Mock; postFee: jest.Mock };
  let periodGuard: { assertNotLocked: jest.Mock };
  let audit: { record: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  const manager = { fake: 'manager' };

  beforeEach(() => {
    deposit = {
      createAndPostInternal: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv1' }, journalEntryId: 'je1', replayed: false }),
    };
    routing = { resolveDepositTarget: jest.fn() };
    depositFee = {
      computeFee: jest.fn().mockReturnValue({ feeAmount: 0, netAmount: 1135000 }),
      postFee: jest.fn().mockResolvedValue(undefined),
    };
    periodGuard = { assertNotLocked: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    consumer = new PosDepositSaleConsumer(
      dataSource as unknown as DataSource,
      deposit as unknown as DepositService,
      routing as unknown as DepositRoutingService,
      depositFee as unknown as DepositFeeService,
      periodGuard as unknown as DepositPeriodGuardService,
      audit as unknown as DepositAuditService,
      eventPublisher as unknown as EventPublisher,
    );
  });

  it('skips lines whose COA maps to no deposit fund', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.OTHER,
      feeRate: '0',
      settlementDays: 0,
    });
    await consumer.handle(event());
    expect(deposit.createAndPostInternal).not.toHaveBeenCalled();
  });

  it('posts a DEPOSIT movement keyed on the payment line, with value_date and no fee', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0',
      settlementDays: 0,
    });
    await consumer.handle(event());
    expect(deposit.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        depositAccountId: 'acc1',
        sourceRefId: 'inv1',
        sourceRefLineId: 'pay1',
        amount: 1135000,
        feeAmount: 0,
        netAmount: 1135000,
        valueDate: '2026-07-15',
      }),
      expect.objectContaining({ organizationId: 'org1', branchId: 'br1' }),
      manager,
    );
    expect(depositFee.postFee).not.toHaveBeenCalled();
  });

  it('R1/R2: posts the fee leg and shifts value_date by settlement_days for a card sale', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0.011',
      feeBearer: 'MERCHANT',
      settlementDays: 2,
    });
    depositFee.computeFee.mockReturnValue({ feeAmount: 12485, netAmount: 1122515 });

    await consumer.handle(event());

    expect(deposit.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({ feeAmount: 12485, netAmount: 1122515, valueDate: '2026-07-17' }),
      expect.anything(),
      manager,
    );
    expect(depositFee.postFee).toHaveBeenCalledWith(
      { id: 'mv1' },
      12485,
      expect.objectContaining({ organizationId: 'org1' }),
      manager,
    );
  });

  it('does not post the fee leg on a replay (idempotent — both legs already committed once)', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0.011',
      feeBearer: 'MERCHANT',
      settlementDays: 0,
    });
    depositFee.computeFee.mockReturnValue({ feeAmount: 12485, netAmount: 1122515 });
    deposit.createAndPostInternal.mockResolvedValue({
      movement: { id: 'mv1' },
      journalEntryId: 'je1',
      replayed: true,
    });

    await consumer.handle(event());

    expect(depositFee.postFee).not.toHaveBeenCalled();
  });

  it('BR-LOCK-02: a locked period alerts + audits, then re-throws (for DLQ retry/dead-letter)', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0',
      settlementDays: 0,
    });
    periodGuard.assertNotLocked.mockRejectedValue(
      new ConflictException('Period 2026-07 is locked for this branch (BR-LOCK-01)'),
    );

    await expect(consumer.handle(event())).rejects.toBeInstanceOf(ConflictException);

    expect(deposit.createAndPostInternal).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'POS_LATE_LOCKED' }),
      expect.objectContaining({ organizationId: 'org1' }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'erp.deposit.locked_period.blocked',
      expect.objectContaining({ payload: expect.objectContaining({ period: '2026-07' }) }),
    );
  });

  it('forwards the payload depositAccountId as explicitDepositAccountId (disambiguates a shared COA)', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc-shb',
      feeRate: '0',
      settlementDays: 0,
    });
    await consumer.handle(event({ depositAccountId: 'acc-shb' }));
    expect(routing.resolveDepositTarget).toHaveBeenCalledWith(
      expect.objectContaining({ explicitDepositAccountId: 'acc-shb' }),
      expect.anything(),
    );
  });

  it('swallows a unique-violation replay (no-op)', async () => {
    routing.resolveDepositTarget.mockResolvedValue({
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0',
      settlementDays: 0,
    });
    deposit.createAndPostInternal.mockRejectedValue({ code: '23505' });
    await expect(consumer.handle(event())).resolves.toBeUndefined();
  });
});
