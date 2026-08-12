import {
  PromotionProgramType,
  PromotionStatus,
  PromotionApplyTo,
  PromotionDiscountMode,
  PromotionLineRole,
  PromotionTargetType,
  PromotionConditionType,
} from '@erp/shared-interfaces';
import { PromotionProgram, PromotionProgramProps } from '../../model/promotion-program';
import { PromotionGroup } from '../../model/promotion-group';
import { PromotionLine } from '../../model/promotion-line';
import { PromotionTier } from '../../model/promotion-tier';
import { PromotionCondition } from '../../model/promotion-condition';
import { CartContext, CartLine } from '../../model/cart';
import { CatalogItemView } from '../../ports/catalog-reader.port';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function aLine(overrides: Partial<PromotionLine> = {}): PromotionLine {
  return {
    id: nextId('line'),
    role: PromotionLineRole.REWARD,
    targetType: PromotionTargetType.ITEM,
    targetId: nextId('item'),
    sortOrder: 0,
    ...overrides,
  };
}

export function aTier(overrides: Partial<PromotionTier> = {}): PromotionTier {
  return {
    id: nextId('tier'),
    fromValue: 0,
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 10,
    sortOrder: 0,
    ...overrides,
  };
}

export function aGroup(overrides: Partial<PromotionGroup> = {}): PromotionGroup {
  return { id: nextId('group'), ordinal: 0, lines: [], tiers: [], ...overrides };
}

export function aCondition(overrides: Partial<PromotionCondition> = {}): PromotionCondition {
  return { type: PromotionConditionType.NONE, multiplyGift: false, ...overrides };
}

/** Fluent builder for domain-level PromotionProgram fixtures — validates via the real create(). */
class ProgramBuilder {
  private props: PromotionProgramProps = {
    id: nextId('program'),
    organizationId: 'org-1',
    code: nextId('KM'),
    name: 'Fixture promotion',
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
    groups: [aGroup()],
    createdBy: 'user-1',
    createdAt: new Date(2026, 0, 1),
  };

  ofType(type: PromotionProgramType): this {
    this.props.type = type;
    return this;
  }

  withPriority(priority: number): this {
    this.props.priority = priority;
    return this;
  }

  withCreatedAt(date: Date): this {
    this.props.createdAt = date;
    return this;
  }

  withGroups(groups: PromotionGroup[]): this {
    this.props.groups = groups;
    return this;
  }

  withCondition(condition: PromotionCondition): this {
    this.props.condition = condition;
    return this;
  }

  with(overrides: Partial<PromotionProgramProps>): this {
    this.props = { ...this.props, ...overrides };
    return this;
  }

  build(): PromotionProgram {
    return PromotionProgram.create(this.props);
  }
}

export function aProgram(): ProgramBuilder {
  return new ProgramBuilder();
}

export function aCatalogItem(overrides: Partial<CatalogItemView> = {}): CatalogItemView {
  const itemId = overrides.itemId ?? nextId('item');
  return {
    itemId,
    code: `SKU-${itemId}`,
    name: `Item ${itemId}`,
    unit: 'cai',
    sellingPrice: 100_000,
    categoryPathIds: [],
    ...overrides,
  };
}

export function aCartLine(overrides: Partial<CartLine> = {}): CartLine {
  return {
    lineId: nextId('cart-line'),
    itemId: nextId('item'),
    quantity: 1,
    unitPrice: 100_000,
    ...overrides,
  };
}

/**
 * Builds a CartContext; the default catalog auto-derives one CatalogItemView
 * per cart line (sellingPrice = the line's unitPrice) so most tests don't
 * need to wire the catalog by hand. Pass `catalog` explicitly to add extra
 * entries (e.g. gift-target items that are not themselves in the cart).
 */
export function aCart(overrides: Partial<CartContext> = {}): CartContext {
  const lines = overrides.lines ?? [];
  const defaultCatalog = new Map(
    lines.map((line) => [line.itemId, aCatalogItem({ itemId: line.itemId, sellingPrice: line.unitPrice })]),
  );
  return {
    organizationId: 'org-1',
    branchId: 'branch-1',
    at: new Date(2026, 0, 15, 12, 0, 0),
    lines,
    catalog: defaultCatalog,
    selectedProgramIds: [],
    excludedProgramIds: [],
    ...overrides,
  };
}
