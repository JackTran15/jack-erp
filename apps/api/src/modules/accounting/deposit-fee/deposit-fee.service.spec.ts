import { FeeBearer, DepositMovementSource, DepositMovementType } from '@erp/shared-interfaces';
import { DepositFeeService } from './deposit-fee.service';
import { DepositService } from '../deposit/deposit.service';
import { CashFundResolverService } from '../cash/cash-fund-resolver.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function setup() {
  const depositService = {
    recordMovement: jest.fn().mockResolvedValue({ movement: { id: 'fee-mv-1' }, journalEntryId: 'je-2' }),
  };
  const cashFundResolver = {
    resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('acc-6417'),
  };
  const service = new DepositFeeService(
    depositService as unknown as DepositService,
    cashFundResolver as unknown as CashFundResolverService,
  );
  return { service, depositService, cashFundResolver };
}

describe('DepositFeeService', () => {
  describe('computeFee', () => {
    it('OQ-01 worked example: MERCHANT bearer, 1.135.000 * 0.011 = 12.485 fee, net 1.122.515', () => {
      const { service } = setup();
      const result = service.computeFee(1_135_000, '0.011', FeeBearer.MERCHANT);
      expect(result).toEqual({ feeAmount: 12_485, netAmount: 1_122_515 });
    });

    it('CUSTOMER bearer: fee=0, net=amount (merchant unaffected)', () => {
      const { service } = setup();
      const result = service.computeFee(1_135_000, '0.011', FeeBearer.CUSTOMER);
      expect(result).toEqual({ feeAmount: 0, netAmount: 1_135_000 });
    });

    it('OQ-01 default: unset feeBearer (null/undefined) defaults to MERCHANT', () => {
      const { service } = setup();
      expect(service.computeFee(100_000, '0.02', undefined)).toEqual({
        feeAmount: 2_000,
        netAmount: 98_000,
      });
      expect(service.computeFee(100_000, '0.02', null)).toEqual({
        feeAmount: 2_000,
        netAmount: 98_000,
      });
    });

    it('feeRate=0 → no fee regardless of bearer', () => {
      const { service } = setup();
      expect(service.computeFee(500_000, '0', FeeBearer.MERCHANT)).toEqual({
        feeAmount: 0,
        netAmount: 500_000,
      });
    });
  });

  describe('postFee', () => {
    const manager = { fake: 'manager' } as any;
    const gross = { id: 'mv-1', depositAccountId: 'acc-1', docDate: '2026-07-16' } as any;

    it('records a WITHDRAWAL fee movement against TK 6417, keyed to the gross movement', async () => {
      const { service, depositService, cashFundResolver } = setup();

      await service.postFee(gross, 12_485, actor, manager);

      expect(cashFundResolver.resolveCoaAccountIdByCode).toHaveBeenCalledWith(
        'org-1',
        '6417',
        manager,
      );
      expect(depositService.recordMovement).toHaveBeenCalledWith(
        {
          depositAccountId: 'acc-1',
          type: DepositMovementType.WITHDRAWAL,
          amount: 12_485,
          contraAccountId: 'acc-6417',
          source: DepositMovementSource.SYSTEM,
          sourceRefId: 'mv-1',
          sourceRefLineId: 'FEE',
          docDate: '2026-07-16',
        },
        actor,
        manager,
      );
    });

    it('is a no-op when feeAmount is 0 (CUSTOMER bearer or feeRate=0)', async () => {
      const { service, depositService } = setup();

      await service.postFee(gross, 0, actor, manager);

      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });
  });
});
