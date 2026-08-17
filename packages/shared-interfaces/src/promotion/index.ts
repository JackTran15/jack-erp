export enum PromotionProgramType {
  INVOICE_DISCOUNT = 'INVOICE_DISCOUNT',
  ITEM_DISCOUNT = 'ITEM_DISCOUNT',
  TIERED_DISCOUNT = 'TIERED_DISCOUNT',
  GIFT_ITEM = 'GIFT_ITEM',
  BUY_M_GET_N = 'BUY_M_GET_N',
}

export enum PromotionStatus {
  TRACKING = 'TRACKING',
  STOPPED = 'STOPPED',
}

export enum PromotionApplyTo {
  ALL_CUSTOMERS = 'ALL_CUSTOMERS',
  CUSTOMER_GROUP = 'CUSTOMER_GROUP',
  BIRTHDAY = 'BIRTHDAY',
  CARD_TIER = 'CARD_TIER',
}

export enum PromotionBirthdayMatch {
  EXACT_DAY = 'EXACT_DAY',
  SAME_WEEK = 'SAME_WEEK',
  SAME_MONTH = 'SAME_MONTH',
  RANGE = 'RANGE',
}

export enum PromotionDiscountMode {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
  FIXED_PRICE = 'FIXED_PRICE',
}

export enum PromotionInvoiceScope {
  NON_PROMO_ONLY = 'NON_PROMO_ONLY',
  ALL_ITEMS = 'ALL_ITEMS',
}

export enum PromotionTierBasis {
  QUANTITY = 'QUANTITY',
  ITEM_VALUE = 'ITEM_VALUE',
  INVOICE_VALUE = 'INVOICE_VALUE',
}

export enum PromotionTierScope {
  PER_ITEM = 'PER_ITEM',
  ALL_ITEMS_IN_GROUP = 'ALL_ITEMS_IN_GROUP',
}

export enum PromotionTargetType {
  PRODUCT = 'PRODUCT',
  ITEM = 'ITEM',
  CATEGORY = 'CATEGORY',
}

export enum PromotionGiftMode {
  ONE_OF = 'ONE_OF',
  ALL_OF = 'ALL_OF',
}

export enum PromotionBuyGetPolicy {
  SPECIFIC = 'SPECIFIC',
  CHEAPEST = 'CHEAPEST',
}

export enum PromotionLineRole {
  CONDITION = 'CONDITION',
  REWARD = 'REWARD',
}

export enum PromotionConditionType {
  NONE = 'NONE',
  MIN_INVOICE_AMOUNT = 'MIN_INVOICE_AMOUNT',
  SPECIFIC_QUANTITY = 'SPECIFIC_QUANTITY',
}

export enum PromotionCalcBasis {
  ALL_ITEMS = 'ALL_ITEMS',
  NON_PROMO_ITEMS = 'NON_PROMO_ITEMS',
  ITEM_CATEGORIES = 'ITEM_CATEGORIES',
}

export enum PromotionGroupMatchMode {
  ANY = 'ANY',
  ALL = 'ALL',
}

/** One row in the CTKM list (POST /v2/promotions/search). */
export interface PromotionProgramSummary {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: PromotionProgramType;
  status: PromotionStatus;
  priority: number;
  applyTo: PromotionApplyTo;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
}

/** A resolved line — target reference inlined, not a root `{ [id]: X }` map. */
export interface PromotionLineDto {
  id: string;
  role: PromotionLineRole;
  targetType: PromotionTargetType;
  targetId: string;
  targetCode?: string;
  targetName?: string;
  unit?: string;
  sellingPrice?: number;
  quantity?: number;
  discountMode?: PromotionDiscountMode;
  discountValue?: number;
  maxUnitPrice?: number;
  sortOrder: number;
}

export interface PromotionTierDto {
  id: string;
  fromValue: number;
  toValue?: number;
  discountMode: PromotionDiscountMode;
  discountValue: number;
  sortOrder: number;
}

export interface PromotionGroupDto {
  id: string;
  ordinal: number;
  name?: string;
  lines: PromotionLineDto[];
  tiers: PromotionTierDto[];
}

export interface PromotionConditionDto {
  type: PromotionConditionType;
  minAmount?: number;
  calcBasis?: PromotionCalcBasis;
  groupMatchMode?: PromotionGroupMatchMode;
  multiplyGift: boolean;
}

/** Full aggregate for GET /v2/promotions/:id — enough for the form to round-trip without extra calls. */
export interface PromotionProgramDetail {
  id: string;
  code: string;
  name: string;
  description?: string;
  type: PromotionProgramType;
  status: PromotionStatus;
  priority: number;
  applyTo: PromotionApplyTo;
  birthdayMatch?: PromotionBirthdayMatch;
  birthdayBeforeDays?: number;
  birthdayAfterDays?: number;
  cardTierId?: string;
  customerGroupIds: string[];
  startDate?: string;
  endDate?: string;
  daysOfWeek: number[];
  startTime?: string;
  endTime?: string;
  autoApply: boolean;
  /** promotion_branches — empty = whole chain (BR-005). */
  branchIds: string[];
  invoiceScope?: PromotionInvoiceScope;
  discountMode?: PromotionDiscountMode;
  discountValue?: number;
  maxDiscountAmount?: number;
  tierBasis?: PromotionTierBasis;
  tierScope?: PromotionTierScope;
  targetType?: PromotionTargetType;
  giftMode?: PromotionGiftMode;
  buyGetPolicy?: PromotionBuyGetPolicy;
  buyQuantity?: number;
  giftQuantity?: number;
  groups: PromotionGroupDto[];
  condition?: PromotionConditionDto;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Evaluate (POST /v2/promotions/evaluate)
// ---------------------------------------------------------------------------

export interface EvaluateCartLineRequest {
  /** Client-supplied, echoed back in lineDiscounts so the client can map results without guessing by order. */
  lineId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  manualLineDiscount?: number;
}

export interface EvaluateCartRequest {
  customerId?: string;
  /** ISO datetime; omitted = server's current time. */
  at?: string;
  /**
   * Dual meaning (ADR-03 in pos-promotion-apply/03-logical-design.md): turns
   * on an `auto_apply=false` program, and/or makes a listed program win a
   * contested resource ahead of `priority` (PromotionResolver.resolve),
   * including one that's `auto_apply=true` and currently winning.
   */
  selectedProgramIds?: string[];
  /**
   * ADR-07 (pos-promotion-apply/03-logical-design.md) — ids to keep out of
   * the race entirely, the inverse of `selectedProgramIds`: always "exclude",
   * never "add". Wins on conflict if an id is in both.
   */
  excludedProgramIds?: string[];
  lines: EvaluateCartLineRequest[];
}

export interface LineDiscount {
  lineId: string;
  discountAmount: number;
  unitPriceAfter: number;
}

export interface GiftOffer {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** ONE_OF = client lets the customer pick 1 of the candidates. */
  mode: PromotionGiftMode;
}

export interface AppliedProgram {
  programId: string;
  code: string;
  name: string;
  type: PromotionProgramType;
  priority: number;
  discountAmount: number;
  lineDiscounts: LineDiscount[];
  gifts: GiftOffer[];
  /**
   * Only set when `type === INVOICE_DISCOUNT` — that's the only type with a
   * single program-level discount mode/value. `ITEM_DISCOUNT`/`TIERED_DISCOUNT`
   * carry it per-reward/per-tier instead, and `BUY_M_GET_N` has none at all —
   * always `undefined` for those, never inferred from the first line/tier.
   */
  discountMode?: PromotionDiscountMode;
  discountValue?: number;
}

/** auto_apply=false programs that were eligible but not run — cashier can still pick them. */
export interface AvailableProgram {
  programId: string;
  code: string;
  name: string;
  type: PromotionProgramType;
  autoApply: boolean;
  estimatedDiscount: number;
}

export type SkippedProgramReason =
  | 'STOPPED'
  | 'DATE_WINDOW'
  | 'DAY_OF_WEEK'
  | 'TIME_OF_DAY'
  | 'BRANCH_SCOPE'
  | 'CUSTOMER_SCOPE'
  | 'CONDITION_NOT_MET'
  | 'RESOURCE_TAKEN'
  | 'NOT_SELECTED'
  | 'EXCLUDED_BY_CASHIER';

export interface SkippedProgram {
  programId: string;
  name: string;
  reason: SkippedProgramReason;
  /** programId of the winning program — only set for reason=RESOURCE_TAKEN. */
  takenBy?: string;
}

export interface EvaluateCartResponse {
  subtotal: number;
  promotionDiscount: number;
  amountAfterPromotion: number;
  appliedPrograms: AppliedProgram[];
  availablePrograms: AvailableProgram[];
  skippedPrograms: SkippedProgram[];
}
