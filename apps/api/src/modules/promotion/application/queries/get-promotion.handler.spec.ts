import { NotFoundException } from '@nestjs/common';
import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionStatus,
  PromotionLineRole,
  PromotionTargetType,
} from '@erp/shared-interfaces';
import { GetPromotionHandler } from './get-promotion.handler';
import { GetPromotionQuery } from './get-promotion.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionProgram } from '../../domain/model/promotion-program';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function programWithLines(): PromotionProgram {
  return PromotionProgram.create({
    id: 'program-1',
    organizationId: 'org-1',
    code: 'KM000001',
    name: 'Test promotion',
    type: PromotionProgramType.ITEM_DISCOUNT,
    status: PromotionStatus.TRACKING,
    priority: 100,
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    customerGroupIds: [],
    daysOfWeek: [],
    autoApply: true,
    branchIds: [],
    groups: [
      {
        id: 'group-1',
        ordinal: 0,
        tiers: [],
        lines: [
          { id: 'line-item', role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'item-1', sortOrder: 0 },
          { id: 'line-product', role: PromotionLineRole.REWARD, targetType: PromotionTargetType.PRODUCT, targetId: 'product-1', sortOrder: 1 },
          { id: 'line-category', role: PromotionLineRole.REWARD, targetType: PromotionTargetType.CATEGORY, targetId: 'category-1', sortOrder: 2 },
          { id: 'line-missing', role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'deleted-item', sortOrder: 3 },
        ],
      },
    ],
    createdBy: 'user-1',
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 2),
  });
}

describe('GetPromotionHandler', () => {
  let promotionRepo: { findById: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let productRepo: { find: jest.Mock };
  let categoryRepo: { find: jest.Mock };
  let handler: GetPromotionHandler;

  beforeEach(() => {
    promotionRepo = { findById: jest.fn() };
    itemRepo = { find: jest.fn().mockResolvedValue([{ id: 'item-1', code: 'SKU-1', name: 'Item 1', unit: 'cai', sellingPrice: '100000' }]) };
    productRepo = { find: jest.fn().mockResolvedValue([{ id: 'product-1', code: 'PRD-1', name: 'Product 1' }]) };
    categoryRepo = { find: jest.fn().mockResolvedValue([{ id: 'category-1', code: 'CAT-1', name: 'Category 1' }]) };
    handler = new GetPromotionHandler(promotionRepo as any, itemRepo as any, productRepo as any, categoryRepo as any);
  });

  it('resolves target references inline for ITEM/PRODUCT/CATEGORY lines', async () => {
    promotionRepo.findById.mockResolvedValue(programWithLines());

    const result = await handler.execute(new GetPromotionQuery('program-1', actor));

    const lines = result.groups[0].lines;
    expect(lines.find((l) => l.id === 'line-item')).toMatchObject({
      targetCode: 'SKU-1',
      targetName: 'Item 1',
      unit: 'cai',
      sellingPrice: 100000,
    });
    expect(lines.find((l) => l.id === 'line-product')).toMatchObject({ targetCode: 'PRD-1', targetName: 'Product 1' });
    expect(lines.find((l) => l.id === 'line-category')).toMatchObject({ targetCode: 'CAT-1', targetName: 'Category 1' });
  });

  it('resolves a deleted target to undefined fields instead of dropping the line', async () => {
    promotionRepo.findById.mockResolvedValue(programWithLines());

    const result = await handler.execute(new GetPromotionQuery('program-1', actor));

    const lines = result.groups[0].lines;
    expect(lines).toHaveLength(4); // the line for 'deleted-item' is still present
    const missingLine = lines.find((l) => l.id === 'line-missing');
    expect(missingLine?.targetCode).toBeUndefined();
    expect(missingLine?.targetName).toBeUndefined();
  });

  it('does not query items/products/categories tables when there are no lines of that target type', async () => {
    const program = PromotionProgram.create({
      id: 'program-2',
      organizationId: 'org-1',
      code: 'KM000002',
      name: 'Invoice discount only',
      type: PromotionProgramType.INVOICE_DISCOUNT,
      status: PromotionStatus.TRACKING,
      priority: 100,
      applyTo: PromotionApplyTo.ALL_CUSTOMERS,
      customerGroupIds: [],
      daysOfWeek: [],
      autoApply: true,
      branchIds: [],
      discountValue: 10,
      groups: [{ id: 'group-1', ordinal: 0, lines: [], tiers: [] }],
      createdBy: 'user-1',
      // GetPromotionHandler only ever receives aggregates loaded via findById(),
      // which are always fully hydrated — createdAt/updatedAt are never absent.
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    });
    promotionRepo.findById.mockResolvedValue(program);

    await handler.execute(new GetPromotionQuery('program-2', actor));

    expect(itemRepo.find).not.toHaveBeenCalled();
    expect(productRepo.find).not.toHaveBeenCalled();
    expect(categoryRepo.find).not.toHaveBeenCalled();
  });

  it('throws 404 when the program does not exist (including cross-tenant and soft-deleted)', async () => {
    promotionRepo.findById.mockResolvedValue(null);

    await expect(handler.execute(new GetPromotionQuery('missing', actor))).rejects.toThrow(NotFoundException);
  });
});
