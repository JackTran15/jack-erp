import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DepositAccountStatus, TargetFund } from '@erp/shared-interfaces';
import { DepositRoutingService } from './deposit-routing.service';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositPaymentPolicyEntity } from './deposit-payment-policy.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'br1',
  roles: [],
} as ActorContext;

const input = {
  paymentMethod: 'card',
  cardType: null,
  resolvedAccountId: 'coa-112',
  branchId: 'br1',
  docDate: '2026-07-15',
};

function fund(id: string): DepositAccountEntity {
  return {
    id,
    accountId: 'coa-112',
    status: DepositAccountStatus.ACTIVE,
  } as DepositAccountEntity;
}

describe('DepositRoutingService', () => {
  let service: DepositRoutingService;
  let accounts: { find: jest.Mock; findOne: jest.Mock };
  let policyRows: DepositPaymentPolicyEntity[];
  let policies: { createQueryBuilder: jest.Mock };

  beforeEach(() => {
    accounts = { find: jest.fn(), findOne: jest.fn() };
    policyRows = [];
    const qb: Record<string, jest.Mock> = {};
    ['where', 'andWhere'].forEach((m) => (qb[m] = jest.fn(() => qb)));
    qb.getMany = jest.fn(() => Promise.resolve(policyRows));
    policies = { createQueryBuilder: jest.fn(() => qb) };
    service = new DepositRoutingService(
      accounts as unknown as Repository<DepositAccountEntity>,
      policies as unknown as Repository<DepositPaymentPolicyEntity>,
    );
  });

  it('routes to DEPOSIT when the COA matches exactly one active fund', async () => {
    accounts.find.mockResolvedValue([fund('acc1')]);
    const res = await service.resolveDepositTarget(input, actor);
    expect(res.fund).toBe(TargetFund.DEPOSIT);
    expect(res.depositAccountId).toBe('acc1');
    expect(res.feeRate).toBe('0');
    expect(res.settlementDays).toBe(0);
  });

  it('returns OTHER when no deposit fund matches the COA', async () => {
    accounts.find.mockResolvedValue([]);
    const res = await service.resolveDepositTarget(input, actor);
    expect(res.fund).toBe(TargetFund.OTHER);
  });

  it('uses the policy fund override when the COA is ambiguous', async () => {
    accounts.find.mockResolvedValue([fund('acc1'), fund('acc2')]);
    policyRows = [
      { branchId: 'br1', cardType: null, depositAccountId: 'acc2', feeRate: 1.1, settlementDays: 2 } as DepositPaymentPolicyEntity,
    ];
    const res = await service.resolveDepositTarget(input, actor);
    expect(res.depositAccountId).toBe('acc2');
    expect(res.feeRate).toBe('1.1');
    expect(res.settlementDays).toBe(2);
  });

  it('throws when the COA is ambiguous and no policy override exists', async () => {
    accounts.find.mockResolvedValue([fund('acc1'), fund('acc2')]);
    policyRows = [];
    await expect(service.resolveDepositTarget(input, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('prefers a branch override policy over the org-wide default', async () => {
    accounts.find.mockResolvedValue([fund('acc1')]);
    policyRows = [
      { branchId: undefined, cardType: null, depositAccountId: undefined, feeRate: 1, settlementDays: 1, effectiveFrom: '2026-01-01' } as DepositPaymentPolicyEntity,
      { branchId: 'br1', cardType: null, depositAccountId: undefined, feeRate: 2, settlementDays: 3, effectiveFrom: '2026-01-01' } as DepositPaymentPolicyEntity,
    ];
    const res = await service.resolveDepositTarget(input, actor);
    expect(res.feeRate).toBe('2');
    expect(res.settlementDays).toBe(3);
  });

  describe('explicitDepositAccountId (payment line named an exact fund)', () => {
    it('uses it directly, even when the COA is shared by another fund (no ambiguity)', async () => {
      accounts.findOne.mockResolvedValue(fund('acc-shb'));
      const res = await service.resolveDepositTarget(
        { ...input, explicitDepositAccountId: 'acc-shb' },
        actor,
      );
      expect(res.fund).toBe(TargetFund.DEPOSIT);
      expect(res.depositAccountId).toBe('acc-shb');
      // Never falls through to the ambiguous-COA matching path.
      expect(accounts.find).not.toHaveBeenCalled();
      expect(accounts.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'acc-shb',
            organizationId: actor.organizationId,
            branchId: input.branchId,
            status: DepositAccountStatus.ACTIVE,
          }),
        }),
      );
    });

    it('still applies the fee/settlement policy for the method', async () => {
      accounts.findOne.mockResolvedValue(fund('acc-shb'));
      policyRows = [
        { branchId: 'br1', cardType: null, depositAccountId: undefined, feeRate: 1.1, settlementDays: 0, effectiveFrom: '2026-01-01' } as DepositPaymentPolicyEntity,
      ];
      const res = await service.resolveDepositTarget(
        { ...input, explicitDepositAccountId: 'acc-shb' },
        actor,
      );
      expect(res.feeRate).toBe('1.1');
    });

    it('throws when the named fund is missing, inactive, or in another branch', async () => {
      accounts.findOne.mockResolvedValue(null);
      await expect(
        service.resolveDepositTarget(
          { ...input, explicitDepositAccountId: 'acc-deactivated' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
