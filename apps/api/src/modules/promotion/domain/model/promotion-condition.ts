import {
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
} from '@erp/shared-interfaces';

/** The "apply conditions" tab (FR-040) — applies to INVOICE_DISCOUNT, ITEM_DISCOUNT, and GIFT_ITEM only. */
export interface PromotionCondition {
  readonly type: PromotionConditionType;
  readonly minAmount?: number;
  readonly calcBasis?: PromotionCalcBasis;
  readonly groupMatchMode?: PromotionGroupMatchMode;
  /** GIFT_ITEM only — multiply gift quantity by floor(basisAmount / minAmount). */
  readonly multiplyGift: boolean;
}
