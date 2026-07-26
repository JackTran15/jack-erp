import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromotionProgramType, PromotionApplyTo, PromotionDiscountMode, PromotionStatus } from '@erp/shared-interfaces';
import { DeletePromotionHandler } from './delete-promotion.handler';
import { DeletePromotionCommand } from './delete-promotion.command';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionProgram } from '../../domain/model/promotion-program';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function existingProgram(): PromotionProgram {
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
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 10,
    groups: [{ id: 'group-1', ordinal: 0, lines: [], tiers: [] }],
    createdBy: 'user-1',
  });
}

describe('DeletePromotionHandler', () => {
  let repo: { findById: jest.Mock; softDelete: jest.Mock };
  let invoicePromotionRepo: { count: jest.Mock };
  let handler: DeletePromotionHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), softDelete: jest.fn() };
    invoicePromotionRepo = { count: jest.fn().mockResolvedValue(0) };
    handler = new DeletePromotionHandler(repo as any, invoicePromotionRepo as any);
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
});
