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
import { BankReceiptsService } from '../../deposit-vouchers/bank-receipts/bank-receipts.service';
import { BankVoucherPartnerType } from '../../deposit-vouchers/enums';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from '../../../document-numbering/document-number-rule.entity';
import { DocumentNumberCounterEntity } from '../../../document-numbering/document-number-counter.entity';

const PARTY_ROW = {
  customer_id: 'cust-1',
  staff_id: 'user-cashier',
  salesperson_id: 'profile-1',
  customer_name: 'Nguyễn Văn A',
  customer_address: '12 Lê Lợi',
  branch_address: '45 Nguyễn Huệ',
  salesperson_user_id: 'user-salesperson',
};

/**
 * The manager the consumer's transaction hands its callback. Beyond the deposit work it now
 * also serves `mintDocumentNumber` (rule + counter) and the party lookup's raw query.
 */
function fakeManager(partyRows: unknown[] = [PARTY_ROW]) {
  const ruleRepo = {
    findOne: jest.fn().mockResolvedValue({
      id: 'rule-nttk',
      prefix: 'NTTK',
      includeDate: false,
      sequenceLength: 6,
      resetPolicy: ResetPolicy.NEVER,
    }),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => x),
  };
  const counterRepo = { create: jest.fn((x: unknown) => x), save: jest.fn((x: unknown) => x) };
  const counterQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({ currentValue: 0 }),
  };
  return {
    getRepository: jest.fn((entity: unknown) =>
      entity === DocumentNumberRuleEntity ? ruleRepo : counterRepo,
    ),
    createQueryBuilder: jest.fn((_entity: unknown) => counterQb),
    query: jest.fn().mockResolvedValue(partyRows),
  };
}

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
  let bankReceipts: { createVoucherForMovement: jest.Mock };
  let manager: ReturnType<typeof fakeManager>;

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
    manager = fakeManager();
    dataSource = { transaction: jest.fn((cb) => cb(manager)) };
    bankReceipts = {
      createVoucherForMovement: jest
        .fn()
        .mockResolvedValue({ voucherId: 'nttk-1', voucherNumber: 'NTTK000001' }),
    };
    consumer = new PosDepositSaleConsumer(
      dataSource as unknown as DataSource,
      deposit as unknown as DepositService,
      routing as unknown as DepositRoutingService,
      depositFee as unknown as DepositFeeService,
      periodGuard as unknown as DepositPeriodGuardService,
      audit as unknown as DepositAuditService,
      eventPublisher as unknown as EventPublisher,
      bankReceipts as unknown as BankReceiptsService,
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

  describe('Phiếu thu tiền gửi (AC-13)', () => {
    const depositTarget = {
      fund: TargetFund.DEPOSIT,
      depositAccountId: 'acc1',
      feeRate: '0',
      settlementDays: 0,
    };

    it('issues a voucher-only receipt naming the customer, staff in collectedBy', async () => {
      routing.resolveDepositTarget.mockResolvedValue(depositTarget);

      await consumer.handle(event());

      expect(bankReceipts.createVoucherForMovement).toHaveBeenCalledTimes(1);
      const [args, passedManager] = bankReceipts.createVoucherForMovement.mock.calls[0];
      expect(args).toEqual(
        expect.objectContaining({
          depositMovementId: 'mv1',
          journalEntryId: 'je1',
          referenceId: 'inv1',
          amount: 1135000,
          partnerType: BankVoucherPartnerType.CUSTOMER,
          partnerId: 'cust-1',
          payerName: 'Nguyễn Văn A',
          partnerAddress: '12 Lê Lợi',
          collectedBy: 'user-salesperson',
        }),
      );
      expect(args.staffId).toBeUndefined();
      expect(passedManager).toBe(manager);
    });

    it('mints the number through the consumer transaction (ADR-06 applies here too)', async () => {
      routing.resolveDepositTarget.mockResolvedValue(depositTarget);

      await consumer.handle(event());

      const [args] = bankReceipts.createVoucherForMovement.mock.calls[0];
      expect(args.documentNumber).toBe('NTTK000001');
    });

    it('does not issue a second receipt on a replayed movement', async () => {
      // Same guard the fee leg uses: a replay means the first delivery already committed
      // both the movement and its document.
      routing.resolveDepositTarget.mockResolvedValue(depositTarget);
      deposit.createAndPostInternal.mockResolvedValue({
        movement: { id: 'mv1' },
        journalEntryId: 'je1',
        replayed: true,
      });

      await consumer.handle(event());

      expect(bankReceipts.createVoucherForMovement).not.toHaveBeenCalled();
    });

    it('issues no receipt for a line that maps to no deposit fund', async () => {
      routing.resolveDepositTarget.mockResolvedValue({
        fund: TargetFund.OTHER,
        feeRate: '0',
        settlementDays: 0,
      });

      await consumer.handle(event());

      expect(bankReceipts.createVoucherForMovement).not.toHaveBeenCalled();
    });

    it('still issues the receipt when the party lookup resolves nothing (AC-14)', async () => {
      routing.resolveDepositTarget.mockResolvedValue(depositTarget);
      manager.query.mockResolvedValue([]);

      await consumer.handle(event());

      const [args] = bankReceipts.createVoucherForMovement.mock.calls[0];
      expect(args.amount).toBe(1135000);
      expect(args.partnerId).toBeUndefined();
      expect(args.collectedBy).toBeUndefined();
    });
  });
});
