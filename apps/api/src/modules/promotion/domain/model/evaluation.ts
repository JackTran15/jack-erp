import { PromotionProgramType, PromotionGiftMode, PromotionDiscountMode } from '@erp/shared-interfaces';

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
   * Only set when `type === INVOICE_DISCOUNT` — the only type with a single
   * program-level discount mode/value. Mirrors `@erp/shared-interfaces`'
   * `AppliedProgram` — see its docblock for why the other 4 types stay
   * `undefined` rather than inferring from the first reward/tier.
   */
  discountMode?: PromotionDiscountMode;
  discountValue?: number;
  /**
   * Only set when `type === INVOICE_DISCOUNT` — mirrors discountMode/discountValue above.
   * Undefined (never `false`) on the other 4 types, so a checkout that applies one of them
   * can never have its points blocked by this field's absence of meaning for that type.
   */
  accruePoints?: boolean;
}

/** auto_apply=false programs that were eligible but not run — the cashier can still pick them. */
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

/** Pure data result of PromotionResolver.resolve() — no I/O, safe to unit test. */
export interface PromotionEvaluation {
  subtotal: number;
  promotionDiscount: number;
  amountAfterPromotion: number;
  appliedPrograms: AppliedProgram[];
  availablePrograms: AvailableProgram[];
  skippedPrograms: SkippedProgram[];
}
