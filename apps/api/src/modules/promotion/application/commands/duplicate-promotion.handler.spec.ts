import { NotFoundException } from '@nestjs/common';
import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionDiscountMode,
  PromotionStatus,
  PromotionLineRole,
  PromotionTargetType,
} from '@erp/shared-interfaces';
import { DuplicatePromotionHandler } from './duplicate-promotion.handler';
import { DuplicatePromotionCommand } from './duplicate-promotion.command';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionProgram } from '../../domain/model/promotion-program';

const actor: ActorContext = { userId: 'user-2', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function originalProgram(): PromotionProgram {
  return PromotionProgram.create({
    id: 'program-1',
    organizationId: 'org-1',
    code: 'KM000001',
    name: 'Original promotion',
    type: PromotionProgramType.ITEM_DISCOUNT,
    status: PromotionStatus.TRACKING,
    priority: 100,
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    customerGroupIds: [],
    daysOfWeek: [],
    autoApply: true,
    branchIds: ['branch-a'],
    accruePoints: false,
    groups: [
      {
        id: 'group-1',
        ordinal: 0,
        lines: [
          {
            id: 'line-1',
            role: PromotionLineRole.REWARD,
            targetType: PromotionTargetType.ITEM,
            targetId: 'item-1',
            discountMode: PromotionDiscountMode.PERCENT,
            discountValue: 30,
            sortOrder: 0,
          },
        ],
        tiers: [],
      },
    ],
    createdBy: 'user-1',
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 2),
  });
}

describe('DuplicatePromotionHandler', () => {
  let repo: { findById: jest.Mock; save: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let handler: DuplicatePromotionHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), save: jest.fn(async (program) => program) };
    docNumbering = { generate: jest.fn().mockResolvedValue('KM000002') };
    handler = new DuplicatePromotionHandler(repo as any, docNumbering as any);
  });

  it('clones the whole aggregate with a new id/code/status/name, keeping every group/line/tier', async () => {
    const original = originalProgram();
    repo.findById.mockResolvedValue(original);

    const result = await handler.execute(new DuplicatePromotionCommand('program-1', actor));

    expect(result.id).not.toBe(original.id);
    expect(result.code).toBe('KM000002');
    expect(result.status).toBe(PromotionStatus.TRACKING);
    expect(result.name).toBe('Original promotion (sao chép)');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].lines).toHaveLength(1);
    expect(result.groups[0].id).not.toBe('group-1');
    expect(result.groups[0].lines[0].id).not.toBe('line-1');
    // Field values are preserved even though ids change.
    expect(result.groups[0].lines[0].discountValue).toBe(30);
    expect(result.branchIds).toEqual(['branch-a']);
  });

  it('does not copy id, createdAt, or createdBy from the original', async () => {
    const original = originalProgram();
    repo.findById.mockResolvedValue(original);

    const result = await handler.execute(new DuplicatePromotionCommand('program-1', actor));

    expect(result.createdBy).toBe(actor.userId);
    expect(result.createdBy).not.toBe(original.createdBy);
    expect(result.createdAt).toBeUndefined();
  });

  it('throws 404 when the original does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(handler.execute(new DuplicatePromotionCommand('missing', actor))).rejects.toThrow(NotFoundException);
    expect(docNumbering.generate).not.toHaveBeenCalled();
  });
});
