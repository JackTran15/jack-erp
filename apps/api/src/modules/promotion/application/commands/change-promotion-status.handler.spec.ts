import { NotFoundException } from '@nestjs/common';
import { PromotionProgramType, PromotionApplyTo, PromotionDiscountMode, PromotionStatus } from '@erp/shared-interfaces';
import { ChangePromotionStatusHandler } from './change-promotion-status.handler';
import { ChangePromotionStatusCommand } from './change-promotion-status.command';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { PromotionAccess } from '../promotion-access.policy';

/** `forActor` stub: chain manager unless a test swaps in a branch manager. */
function accessStub(isChainManager = true, activeBranchId: string | null = 'branch-1') {
  return { forActor: jest.fn(async () => new PromotionAccess(isChainManager, activeBranchId ?? undefined)) };
}

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function existingProgram(
  overrides: Partial<Parameters<typeof PromotionProgram.create>[0]> = {},
): PromotionProgram {
  return PromotionProgram.create({
    id: 'program-1',
    organizationId: 'org-1',
    code: 'KM000001',
    name: 'Test promotion',
    type: PromotionProgramType.INVOICE_DISCOUNT,
    status: PromotionStatus.TRACKING,
    priority: 100,
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    customerGroupIds: [],
    daysOfWeek: [],
    autoApply: true,
    branchIds: [],
    accruePoints: false,
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 10,
    groups: [{ id: 'group-1', ordinal: 0, lines: [], tiers: [] }],
    createdBy: 'user-1',
    ...overrides,
  });
}

describe('ChangePromotionStatusHandler', () => {
  let repo: { findById: jest.Mock; save: jest.Mock };
  let handler: ChangePromotionStatusHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), save: jest.fn(async (program) => program) };
    handler = new ChangePromotionStatusHandler(repo as any, accessStub() as any);
  });

  it('changes status while leaving every other field untouched', async () => {
    repo.findById.mockResolvedValue(existingProgram());

    const result = await handler.execute(
      new ChangePromotionStatusCommand('program-1', { status: PromotionStatus.STOPPED }, actor),
    );

    expect(result.status).toBe(PromotionStatus.STOPPED);
    expect(result.name).toBe('Test promotion');
    expect(result.discountValue).toBe(10);
  });

  it('throws 404 when the program does not exist (including cross-tenant)', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new ChangePromotionStatusCommand('program-1', { status: PromotionStatus.STOPPED }, actor)),
    ).rejects.toThrow(NotFoundException);
  });

  describe('ownership (2026100301 AC-02, AC-06, AC-07, AC-11)', () => {
    const asBranchManager = () => new ChangePromotionStatusHandler(repo as any, accessStub(false, 'branch-hcm') as any);
    const stop = (h: ChangePromotionStatusHandler) =>
      h.execute(new ChangePromotionStatusCommand('program-1', { status: PromotionStatus.STOPPED }, actor));

    it('AC-02: a branch manager changes the status of its own program', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hcm', branchIds: ['branch-hcm'] }));
      expect((await stop(asBranchManager())).status).toBe(PromotionStatus.STOPPED);
    });

    it('AC-11 / A-02: a branch manager reactivates a program the company stopped', async () => {
      repo.findById.mockResolvedValue(
        existingProgram({ ownerBranchId: 'branch-hcm', branchIds: ['branch-hcm'], status: PromotionStatus.STOPPED }),
      );
      const result = await asBranchManager().execute(
        new ChangePromotionStatusCommand('program-1', { status: PromotionStatus.TRACKING }, actor),
      );
      expect(result.status).toBe(PromotionStatus.TRACKING);
    });

    it('AC-06: a branch manager stopping a visible chain program gets 403', async () => {
      repo.findById.mockResolvedValue(existingProgram());
      await expect(stop(asBranchManager())).rejects.toMatchObject({ status: 403 });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('AC-07: a branch manager stopping another branch\'s program gets 404', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hn', branchIds: ['branch-hn'] }));
      await expect(stop(asBranchManager())).rejects.toThrow(NotFoundException);
    });

    it('AC-11: a chain manager stops a branch program', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hcm', branchIds: ['branch-hcm'] }));
      const result = await stop(handler);
      expect(result.status).toBe(PromotionStatus.STOPPED);
      expect(result.ownerBranchId).toBe('branch-hcm');
    });
  });
});
