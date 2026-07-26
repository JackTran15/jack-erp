import { NotFoundException } from '@nestjs/common';
import { PromotionProgramType, PromotionApplyTo, PromotionDiscountMode, PromotionStatus } from '@erp/shared-interfaces';
import { ChangePromotionStatusHandler } from './change-promotion-status.handler';
import { ChangePromotionStatusCommand } from './change-promotion-status.command';
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

describe('ChangePromotionStatusHandler', () => {
  let repo: { findById: jest.Mock; save: jest.Mock };
  let handler: ChangePromotionStatusHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), save: jest.fn(async (program) => program) };
    handler = new ChangePromotionStatusHandler(repo as any);
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
});
