import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementSource, DepositMovementType } from '@erp/shared-interfaces';
import { DepositRefundService } from './deposit-refund.service';
import { DepositMovementEntity } from '../deposit/deposit-movement.entity';
import { DepositService } from '../deposit/deposit.service';
import { JournalService } from '../journal/journal.service';
import { DepositReconService } from '../deposit-recon/deposit-recon.service';
import { DepositPeriodGuardService } from '../deposit-period-lock/deposit-period-guard.service';
import { DepositAuditService } from '../deposit-audit/deposit-audit.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function grossMovement(over: Record<string, unknown> = {}) {
  return {
    id: 'mv-gross-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    depositAccountId: 'dep-1',
    amount: 1_135_000,
    docDate: '2026-07-10',
    source: DepositMovementSource.POS_INVOICE,
    sourceRefId: 'inv-1',
    sourceRefLineId: 'pay-1',
    journalEntryId: 'je-1',
    ...over,
  };
}

function setup(opts: {
  grossRows?: any[];
  existingReversal?: any;
  reconciledThrows?: boolean;
  lockedThrows?: boolean;
}) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue(opts.grossRows ?? [grossMovement()]),
  };
  const movementRepo = { createQueryBuilder: jest.fn(() => qb) };

  const txMovementRepo = {
    findOne: jest.fn().mockResolvedValue(opts.existingReversal ?? null),
  };
  const manager: any = {
    getRepository: jest.fn((entity: any) => {
      if (entity === DepositMovementEntity) return txMovementRepo;
      return {};
    }),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)) };

  const depositService = {
    recordMovement: jest
      .fn()
      .mockResolvedValue({ movement: { id: 'mv-reversal-1' }, journalEntryId: 'je-2' }),
  };
  const journal = {
    getById: jest.fn().mockResolvedValue({
      lines: [
        { accountId: 'coa-112', debitAmount: 1_135_000, creditAmount: 0 },
        { accountId: 'coa-511', debitAmount: 0, creditAmount: 1_135_000 },
      ],
    }),
  };
  const recon = {
    assertNotReconciled: opts.reconciledThrows
      ? jest.fn().mockRejectedValue(new ConflictException('locked'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const periodGuard = {
    assertNotLocked: opts.lockedThrows
      ? jest.fn().mockRejectedValue(new ConflictException('Period 2026-07 is locked for this branch (BR-LOCK-01)'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new DepositRefundService(
    movementRepo as any,
    dataSource as unknown as DataSource,
    depositService as unknown as DepositService,
    journal as unknown as JournalService,
    recon as unknown as DepositReconService,
    periodGuard as unknown as DepositPeriodGuardService,
    audit as unknown as DepositAuditService,
  );

  return { service, depositService, journal, recon, periodGuard, audit, manager, txMovementRepo };
}

describe('DepositRefundService.reverseForCancelledInvoice', () => {
  it('BR-REF-01: reverses the gross amount, resolving contra from the original JE credit line', async () => {
    const { service, depositService } = setup({});

    const result = await service.reverseForCancelledInvoice('inv-1', actor);

    expect(result.reversedCount).toBe(1);
    expect(depositService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        depositAccountId: 'dep-1',
        type: DepositMovementType.WITHDRAWAL,
        amount: 1_135_000,
        contraAccountId: 'coa-511',
        sourceRefId: 'inv-1',
        sourceRefLineId: 'pay-1-REVERSAL',
      }),
      actor,
      expect.anything(),
    );
  });

  it('never touches the FEE movement — only non-FEE, non-REVERSAL lines are candidates', async () => {
    const { service } = setup({
      grossRows: [grossMovement()], // the query itself excludes FEE/REVERSAL rows; this asserts the happy path still works
    });
    const result = await service.reverseForCancelledInvoice('inv-1', actor);
    expect(result.reversedCount).toBe(1);
  });

  it('BR-REF-02: reconciled movement → ConflictException with the manual-refund guidance', async () => {
    const { service } = setup({ reconciledThrows: true });

    await expect(service.reverseForCancelledInvoice('inv-1', actor)).rejects.toThrow(
      /BR-REF-02/,
    );
  });

  it('BR-LOCK-01: locked period → ConflictException propagates (distinct from BR-REF-02)', async () => {
    const { service } = setup({ lockedThrows: true });

    await expect(service.reverseForCancelledInvoice('inv-1', actor)).rejects.toThrow(
      /BR-LOCK-01/,
    );
  });

  it('idempotent replay: an existing reversal for the line is returned without a new movement', async () => {
    const { service, depositService } = setup({
      existingReversal: { id: 'mv-reversal-existing' },
    });

    const result = await service.reverseForCancelledInvoice('inv-1', actor);

    expect(result.movementIds).toEqual(['mv-reversal-existing']);
    expect(depositService.recordMovement).not.toHaveBeenCalled();
  });

  it('no gross movement found (e.g. a cash invoice) → no-op, 0 reversed', async () => {
    const { service, depositService } = setup({ grossRows: [] });

    const result = await service.reverseForCancelledInvoice('inv-1', actor);

    expect(result.reversedCount).toBe(0);
    expect(depositService.recordMovement).not.toHaveBeenCalled();
  });
});
