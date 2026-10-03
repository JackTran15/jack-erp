import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromotionProgramType, PromotionApplyTo, PromotionDiscountMode, PromotionStatus } from '@erp/shared-interfaces';
import { DeletePromotionHandler } from './delete-promotion.handler';
import { DeletePromotionCommand } from './delete-promotion.command';
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

describe('DeletePromotionHandler', () => {
  let repo: { findById: jest.Mock; softDelete: jest.Mock };
  let invoicePromotionRepo: { count: jest.Mock };
  let handler: DeletePromotionHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), softDelete: jest.fn() };
    invoicePromotionRepo = { count: jest.fn().mockResolvedValue(0) };
    handler = new DeletePromotionHandler(repo as any, invoicePromotionRepo as any, accessStub() as any);
  });

  it('soft-deletes via the repository (not a hard delete)', async () => {
    repo.findById.mockResolvedValue(existingProgram());

    await handler.execute(new DeletePromotionCommand('program-1', actor));

    expect(repo.softDelete).toHaveBeenCalledWith('org-1', 'program-1');
  });

  it('throws 404 when the program does not exist (including cross-tenant)', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(handler.execute(new DeletePromotionCommand('program-1', actor))).rejects.toThrow(NotFoundException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('blocks deletion when the program is still referenced by an invoice_promotions row', async () => {
    repo.findById.mockResolvedValue(existingProgram());
    invoicePromotionRepo.count.mockResolvedValue(1);

    await expect(handler.execute(new DeletePromotionCommand('program-1', actor))).rejects.toThrow(BadRequestException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  describe('ownership (2026100301 AC-02, AC-06, AC-07, AC-11)', () => {
    const asBranchManager = () =>
      new DeletePromotionHandler(repo as any, invoicePromotionRepo as any, accessStub(false, 'branch-hcm') as any);

    it('AC-02: a branch manager deletes its own program', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hcm', branchIds: ['branch-hcm'] }));
      await asBranchManager().execute(new DeletePromotionCommand('program-1', actor));
      expect(repo.softDelete).toHaveBeenCalledWith('org-1', 'program-1');
    });

    it('AC-06: a branch manager deleting a visible chain program gets 403', async () => {
      repo.findById.mockResolvedValue(existingProgram());
      await expect(asBranchManager().execute(new DeletePromotionCommand('program-1', actor))).rejects.toMatchObject({
        status: 403,
      });
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('AC-07: another branch\'s program is 404 before the invoice check runs', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hn', branchIds: ['branch-hn'] }));
      invoicePromotionRepo.count.mockResolvedValue(3);
      await expect(asBranchManager().execute(new DeletePromotionCommand('program-1', actor))).rejects.toThrow(
        NotFoundException,
      );
      expect(invoicePromotionRepo.count).not.toHaveBeenCalled();
    });

    it('AC-11: a chain manager deletes a branch program', async () => {
      repo.findById.mockResolvedValue(existingProgram({ ownerBranchId: 'branch-hcm', branchIds: ['branch-hcm'] }));
      await handler.execute(new DeletePromotionCommand('program-1', actor));
      expect(repo.softDelete).toHaveBeenCalledWith('org-1', 'program-1');
    });
  });
});
