import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionDiscountMode,
  PromotionLineRole,
  PromotionTargetType,
  PromotionTierBasis,
  PromotionBuyGetPolicy,
  PromotionGiftMode,
  PromotionConditionType,
} from '@erp/shared-interfaces';
import { CreatePromotionHandler } from './create-promotion.handler';
import { CreatePromotionCommand } from './create-promotion.command';
import { CreatePromotionV2Dto } from '../dto/create-promotion.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function baseDto(overrides: Partial<CreatePromotionV2Dto> = {}): CreatePromotionV2Dto {
  return {
    type: PromotionProgramType.INVOICE_DISCOUNT,
    name: 'Test promotion',
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 10,
    groups: [{ ordinal: 0 }],
    ...overrides,
  } as CreatePromotionV2Dto;
}

describe('CreatePromotionHandler', () => {
  let repo: { save: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let handler: CreatePromotionHandler;

  beforeEach(() => {
    repo = { save: jest.fn(async (program) => program) };
    docNumbering = { generate: jest.fn().mockResolvedValue('KM000001') };
    handler = new CreatePromotionHandler(repo as any, docNumbering as any);
  });

  it('generates a code via DocumentNumberingService and creates INVOICE_DISCOUNT', async () => {
    const result = await handler.execute(new CreatePromotionCommand(baseDto(), actor));

    expect(docNumbering.generate).toHaveBeenCalledWith('PROMOTION', actor.branchId, actor);
    expect(result.code).toBe('KM000001');
    expect(result.status).toBe('TRACKING');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('creates ITEM_DISCOUNT with reward lines', async () => {
    const dto = baseDto({
      type: PromotionProgramType.ITEM_DISCOUNT,
      discountMode: undefined,
      discountValue: undefined,
      groups: [
        {
          ordinal: 0,
          lines: [
            {
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: 'item-1',
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 30,
            },
          ],
        },
      ],
    });

    const result = await handler.execute(new CreatePromotionCommand(dto, actor));
    expect(result.type).toBe(PromotionProgramType.ITEM_DISCOUNT);
    expect(result.groups[0].lines).toHaveLength(1);
  });

  it('creates TIERED_DISCOUNT with tiers', async () => {
    const dto = baseDto({
      type: PromotionProgramType.TIERED_DISCOUNT,
      discountMode: undefined,
      discountValue: undefined,
      tierBasis: PromotionTierBasis.QUANTITY,
      groups: [
        {
          ordinal: 0,
          lines: [{ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'item-1' }],
          tiers: [{ fromValue: 5, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 }],
        },
      ],
    });

    const result = await handler.execute(new CreatePromotionCommand(dto, actor));
    expect(result.groups[0].tiers).toHaveLength(1);
  });

  it('creates GIFT_ITEM with a condition', async () => {
    const dto = baseDto({
      type: PromotionProgramType.GIFT_ITEM,
      discountMode: undefined,
      discountValue: undefined,
      giftMode: PromotionGiftMode.ONE_OF,
      groups: [
        {
          ordinal: 0,
          lines: [{ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'gift-1' }],
        },
      ],
      condition: { type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: true },
    });

    const result = await handler.execute(new CreatePromotionCommand(dto, actor));
    expect(result.condition?.multiplyGift).toBe(true);
  });

  it('creates BUY_M_GET_N', async () => {
    const dto = baseDto({
      type: PromotionProgramType.BUY_M_GET_N,
      discountMode: undefined,
      discountValue: undefined,
      buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST,
      buyQuantity: 3,
      giftQuantity: 1,
      groups: [
        {
          ordinal: 0,
          lines: [{ role: PromotionLineRole.CONDITION, targetType: PromotionTargetType.ITEM, targetId: 'item-1' }],
        },
      ],
    });

    const result = await handler.execute(new CreatePromotionCommand(dto, actor));
    expect(result.buyQuantity).toBe(3);
  });

  it('maps a DomainValidationError to a 400 with every issue, not just the first', async () => {
    // Two independent BR-004 violations at once: empty name, and discountValue <= 0.
    const dto = baseDto({ name: '', discountValue: 0 });

    await expect(handler.execute(new CreatePromotionCommand(dto, actor))).rejects.toMatchObject({
      response: {
        message: 'Invalid promotion configuration',
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'NAME_REQUIRED' }),
          expect.objectContaining({ code: 'DISCOUNT_VALUE_NOT_POSITIVE' }),
        ]),
      },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('assigns fresh ids to every group/line/tier, never reusing across programs', async () => {
    const dto = baseDto({
      type: PromotionProgramType.ITEM_DISCOUNT,
      discountMode: undefined,
      discountValue: undefined,
      groups: [
        { ordinal: 0, lines: [{ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'item-1' }] },
      ],
    });

    const first = await handler.execute(new CreatePromotionCommand(dto, actor));
    const second = await handler.execute(new CreatePromotionCommand(dto, actor));

    expect(first.id).not.toBe(second.id);
    expect(first.groups[0].id).not.toBe(second.groups[0].id);
    expect(first.groups[0].lines[0].id).not.toBe(second.groups[0].lines[0].id);
  });
});
