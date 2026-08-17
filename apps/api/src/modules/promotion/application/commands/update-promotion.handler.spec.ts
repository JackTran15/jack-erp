import { NotFoundException } from '@nestjs/common';
import { PromotionProgramType, PromotionApplyTo, PromotionDiscountMode, PromotionStatus } from '@erp/shared-interfaces';
import { UpdatePromotionHandler } from './update-promotion.handler';
import { UpdatePromotionCommand } from './update-promotion.command';
import { UpdatePromotionV2Dto } from '../dto/update-promotion.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionProgram } from '../../domain/model/promotion-program';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function existingProgram(overrides: Partial<Parameters<typeof PromotionProgram.create>[0]> = {}): PromotionProgram {
  return PromotionProgram.create({
    id: 'program-1',
    organizationId: 'org-1',
    code: 'KM000001',
    name: 'Original name',
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

function baseDto(overrides: Partial<UpdatePromotionV2Dto> = {}): UpdatePromotionV2Dto {
  return {
    type: PromotionProgramType.INVOICE_DISCOUNT,
    name: 'Updated name',
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 20,
    groups: [{ ordinal: 0 }],
    ...overrides,
  } as UpdatePromotionV2Dto;
}

describe('UpdatePromotionHandler', () => {
  let repo: { findById: jest.Mock; save: jest.Mock };
  let handler: UpdatePromotionHandler;

  beforeEach(() => {
    repo = { findById: jest.fn(), save: jest.fn(async (program) => program) };
    handler = new UpdatePromotionHandler(repo as any);
  });

  it('updates fields while preserving id/code/status/createdBy', async () => {
    repo.findById.mockResolvedValue(existingProgram());

    const result = await handler.execute(new UpdatePromotionCommand('program-1', baseDto(), actor));

    expect(result.name).toBe('Updated name');
    expect(result.discountValue).toBe(20);
    expect(result.id).toBe('program-1');
    expect(result.code).toBe('KM000001');
    expect(result.status).toBe(PromotionStatus.TRACKING);
  });

  it('rejects changing type with PROMOTION_TYPE_IMMUTABLE', async () => {
    repo.findById.mockResolvedValue(existingProgram({ type: PromotionProgramType.INVOICE_DISCOUNT }));

    const dto = baseDto({ type: PromotionProgramType.ITEM_DISCOUNT });

    await expect(handler.execute(new UpdatePromotionCommand('program-1', dto, actor))).rejects.toMatchObject({
      response: { code: 'PROMOTION_TYPE_IMMUTABLE' },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws 404 when the program does not exist (including cross-tenant)', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(handler.execute(new UpdatePromotionCommand('program-1', baseDto(), actor))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('maps a DomainValidationError to a 400 with every issue, not just the first', async () => {
    repo.findById.mockResolvedValue(existingProgram());

    // Two independent BR-004 violations at once: empty name, and discountValue <= 0.
    const dto = baseDto({ name: '', discountValue: 0 });

    await expect(handler.execute(new UpdatePromotionCommand('program-1', dto, actor))).rejects.toMatchObject({
      response: {
        message: 'Invalid promotion configuration',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'NAME_REQUIRED' }),
          expect.objectContaining({ code: 'DISCOUNT_VALUE_NOT_POSITIVE' }),
        ]),
      },
    });
  });

  it('assigns fresh ids to groups/lines/tiers on every update (delete-then-insert semantics)', async () => {
    repo.findById.mockResolvedValue(existingProgram());

    const result = await handler.execute(new UpdatePromotionCommand('program-1', baseDto(), actor));

    expect(result.groups[0].id).not.toBe('group-1');
  });
});
