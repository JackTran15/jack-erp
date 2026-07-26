import {
  PromotionProgramType,
  PromotionApplyTo as ApiApplyTo,
  PromotionBirthdayMatch,
  PromotionInvoiceScope,
  PromotionDiscountMode,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionTargetType,
  PromotionGiftMode,
  PromotionBuyGetPolicy,
  PromotionLineRole,
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
  type PromotionProgramDetail,
  type PromotionLineDto,
} from "@erp/shared-interfaces";
import {
  blankApplicableGood,
  blankApplicableGroup,
  blankBuyGetRow,
  blankGiftProduct,
  blankGoodsDiscountRow,
  blankTierGroup,
  blankTierProduct,
  blankTierRow,
  buildInitialFormState,
} from "../programs/program-form.constants";
import { PromotionApplyTo as FormApplyTo, PromotionForm } from "../programs/programs.constants";
import {
  ApplyScope,
  BirthdayDateMode,
  BuyGetGiftPolicy,
  CalcBasis,
  ConditionType,
  DayOfWeek,
  DiscountType,
  GiftMode,
  GoodsDiscountMethod,
  GoodsDiscountScope,
  ProductGroupLogic,
  StoreScope,
  TierBasis,
  TierDiscountUnit,
  TierTarget,
  type ApplicableGood,
  type ApplicableGroup,
  type BuyGetRow,
  type GiftProduct,
  type GoodsDiscountRow,
  type ProgramFormState,
  type TierGroup,
} from "../programs/program-form.types";

// ---------------------------------------------------------------------------
// Wire-request shapes — `CreatePromotionV2Dto`/`UpdatePromotionV2Dto` (apps/api)
// are NestJS class-validator classes, not exported from `@erp/shared-interfaces`;
// these are the plain-object mirrors the mapper actually builds and `erpApi`
// sends as-is (the hand-rolled `erpApi` client does not validate bodies against
// the OpenAPI schema, unlike a generated fetch client).
// ---------------------------------------------------------------------------

export interface PromotionLineInput {
  role: PromotionLineRole;
  targetType: PromotionTargetType;
  targetId: string;
  quantity?: number;
  discountMode?: PromotionDiscountMode;
  discountValue?: number;
  maxUnitPrice?: number;
  sortOrder?: number;
}

export interface PromotionTierInput {
  fromValue: number;
  toValue?: number;
  discountMode: PromotionDiscountMode;
  discountValue: number;
  sortOrder?: number;
}

export interface PromotionGroupInput {
  ordinal: number;
  name?: string;
  lines?: PromotionLineInput[];
  tiers?: PromotionTierInput[];
}

export interface PromotionConditionInput {
  type: PromotionConditionType;
  minAmount?: number;
  calcBasis?: PromotionCalcBasis;
  groupMatchMode?: PromotionGroupMatchMode;
  multiplyGift?: boolean;
}

export interface CreatePromotionRequest {
  type: PromotionProgramType;
  name: string;
  description?: string;
  applyTo: ApiApplyTo;
  birthdayMatch?: PromotionBirthdayMatch;
  birthdayBeforeDays?: number;
  birthdayAfterDays?: number;
  cardTierId?: string;
  customerGroupIds?: string[];
  startDate?: string;
  endDate?: string;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  autoApply?: boolean;
  priority?: number;
  branchIds?: string[];
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
  groups: PromotionGroupInput[];
  condition?: PromotionConditionInput;
}

// ---------------------------------------------------------------------------
// PromotionForm (FE, 5-way UI menu) ↔ PromotionProgramType (API)
// ---------------------------------------------------------------------------

const FORM_TO_PROGRAM_TYPE: Record<PromotionForm, PromotionProgramType> = {
  [PromotionForm.INVOICE_DISCOUNT]: PromotionProgramType.INVOICE_DISCOUNT,
  [PromotionForm.PRODUCT_DISCOUNT]: PromotionProgramType.ITEM_DISCOUNT,
  [PromotionForm.TIERED_DISCOUNT]: PromotionProgramType.TIERED_DISCOUNT,
  [PromotionForm.GIFT]: PromotionProgramType.GIFT_ITEM,
  [PromotionForm.BUY_M_GET_N]: PromotionProgramType.BUY_M_GET_N,
};

const PROGRAM_TYPE_TO_FORM: Record<PromotionProgramType, PromotionForm> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: PromotionForm.INVOICE_DISCOUNT,
  [PromotionProgramType.ITEM_DISCOUNT]: PromotionForm.PRODUCT_DISCOUNT,
  [PromotionProgramType.TIERED_DISCOUNT]: PromotionForm.TIERED_DISCOUNT,
  [PromotionProgramType.GIFT_ITEM]: PromotionForm.GIFT,
  [PromotionProgramType.BUY_M_GET_N]: PromotionForm.BUY_M_GET_N,
};

export function promotionFormToProgramType(form: PromotionForm): PromotionProgramType {
  return FORM_TO_PROGRAM_TYPE[form];
}

export function programTypeToPromotionForm(type: PromotionProgramType): PromotionForm {
  return PROGRAM_TYPE_TO_FORM[type];
}

// ---------------------------------------------------------------------------
// Small scalar/enum mappers — every renamed pair between the FE view-model and
// the API DTO lives here (docs/26-promotion-design.md §10.3 + TKT-KM-12 AC).
// ---------------------------------------------------------------------------

function numOrUndefined(v: number | ""): number | undefined {
  return v === "" ? undefined : v;
}

const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
  DayOfWeek.SUN,
];

function dayToIso(day: DayOfWeek): number {
  return DAY_ORDER.indexOf(day) + 1;
}

function isoToDay(iso: number): DayOfWeek {
  return DAY_ORDER[iso - 1];
}

function applyToToApi(v: FormApplyTo): ApiApplyTo {
  switch (v) {
    case FormApplyTo.CUSTOMER_GROUP:
      return ApiApplyTo.CUSTOMER_GROUP;
    case FormApplyTo.HAS_BIRTHDAY:
      return ApiApplyTo.BIRTHDAY;
    case FormApplyTo.HAS_CARD_TIER:
      return ApiApplyTo.CARD_TIER;
    case FormApplyTo.ALL_CUSTOMERS:
    default:
      return ApiApplyTo.ALL_CUSTOMERS;
  }
}

function applyToFromApi(v: ApiApplyTo): FormApplyTo {
  switch (v) {
    case ApiApplyTo.CUSTOMER_GROUP:
      return FormApplyTo.CUSTOMER_GROUP;
    case ApiApplyTo.BIRTHDAY:
      return FormApplyTo.HAS_BIRTHDAY;
    case ApiApplyTo.CARD_TIER:
      return FormApplyTo.HAS_CARD_TIER;
    case ApiApplyTo.ALL_CUSTOMERS:
    default:
      return FormApplyTo.ALL_CUSTOMERS;
  }
}

function birthdayModeToApi(v: BirthdayDateMode | ""): PromotionBirthdayMatch | undefined {
  switch (v) {
    case BirthdayDateMode.WEEK:
      return PromotionBirthdayMatch.SAME_WEEK;
    case BirthdayDateMode.MONTH:
      return PromotionBirthdayMatch.SAME_MONTH;
    case BirthdayDateMode.RANGE:
      return PromotionBirthdayMatch.RANGE;
    default:
      return undefined;
  }
}

/** API's `EXACT_DAY` has no FE equivalent (form only wires WEEK/MONTH/RANGE) — falls back to "". */
function birthdayModeFromApi(v?: PromotionBirthdayMatch): BirthdayDateMode | "" {
  switch (v) {
    case PromotionBirthdayMatch.SAME_WEEK:
      return BirthdayDateMode.WEEK;
    case PromotionBirthdayMatch.SAME_MONTH:
      return BirthdayDateMode.MONTH;
    case PromotionBirthdayMatch.RANGE:
      return BirthdayDateMode.RANGE;
    default:
      return "";
  }
}

/** FE `TierTarget` (PRODUCT/VARIANT/GROUP) ↔ API `PromotionTargetType` (PRODUCT/ITEM/CATEGORY) — §10.3. */
function tierTargetToApi(v: TierTarget): PromotionTargetType {
  switch (v) {
    case TierTarget.VARIANT:
      return PromotionTargetType.ITEM;
    case TierTarget.GROUP:
      return PromotionTargetType.CATEGORY;
    case TierTarget.PRODUCT:
    default:
      return PromotionTargetType.PRODUCT;
  }
}

function tierTargetFromApi(v?: PromotionTargetType): TierTarget {
  switch (v) {
    case PromotionTargetType.ITEM:
      return TierTarget.VARIANT;
    case PromotionTargetType.CATEGORY:
      return TierTarget.GROUP;
    case PromotionTargetType.PRODUCT:
    default:
      return TierTarget.PRODUCT;
  }
}

function calcBasisToApi(v: CalcBasis): PromotionCalcBasis {
  switch (v) {
    case CalcBasis.NOT_DISCOUNTED:
      return PromotionCalcBasis.NON_PROMO_ITEMS;
    case CalcBasis.PRODUCT_GROUP:
      return PromotionCalcBasis.ITEM_CATEGORIES;
    case CalcBasis.ALL_ITEMS:
    default:
      return PromotionCalcBasis.ALL_ITEMS;
  }
}

function calcBasisFromApi(v?: PromotionCalcBasis): CalcBasis {
  switch (v) {
    case PromotionCalcBasis.NON_PROMO_ITEMS:
      return CalcBasis.NOT_DISCOUNTED;
    case PromotionCalcBasis.ITEM_CATEGORIES:
      return CalcBasis.PRODUCT_GROUP;
    case PromotionCalcBasis.ALL_ITEMS:
    default:
      return CalcBasis.ALL_ITEMS;
  }
}

function conditionTypeToApi(v: ConditionType): PromotionConditionType {
  switch (v) {
    case ConditionType.SPECIFIC_QUANTITY:
      return PromotionConditionType.SPECIFIC_QUANTITY;
    case ConditionType.MIN_TOTAL:
      return PromotionConditionType.MIN_INVOICE_AMOUNT;
    case ConditionType.NONE:
    default:
      return PromotionConditionType.NONE;
  }
}

/** FE `GiftMode.ONE`/`ALL` ↔ API `PromotionGiftMode.ONE_OF`/`ALL_OF` — §10.3. */
function giftModeToApi(v: GiftMode): PromotionGiftMode {
  return v === GiftMode.ALL ? PromotionGiftMode.ALL_OF : PromotionGiftMode.ONE_OF;
}

function giftModeFromApi(v?: PromotionGiftMode): GiftMode {
  return v === PromotionGiftMode.ALL_OF ? GiftMode.ALL : GiftMode.ONE;
}

function applyScopeToApi(v: ApplyScope): PromotionInvoiceScope {
  return v === ApplyScope.ALL_ITEMS ? PromotionInvoiceScope.ALL_ITEMS : PromotionInvoiceScope.NON_PROMO_ONLY;
}

function applyScopeFromApi(v?: PromotionInvoiceScope): ApplyScope {
  return v === PromotionInvoiceScope.ALL_ITEMS ? ApplyScope.ALL_ITEMS : ApplyScope.NON_PROMO_ONLY;
}

/** FE `GoodsDiscountMethod` and API `PromotionDiscountMode` share the same 3 names (PERCENT/AMOUNT/FIXED_PRICE) — kept as an explicit switch (not a same-name passthrough) so an independent rename on either side fails loudly instead of silently. */
function goodsDiscountMethodToApi(v: GoodsDiscountMethod): PromotionDiscountMode {
  switch (v) {
    case GoodsDiscountMethod.AMOUNT:
      return PromotionDiscountMode.AMOUNT;
    case GoodsDiscountMethod.FIXED_PRICE:
      return PromotionDiscountMode.FIXED_PRICE;
    case GoodsDiscountMethod.PERCENT:
    default:
      return PromotionDiscountMode.PERCENT;
  }
}

function goodsDiscountMethodFromApi(v?: PromotionDiscountMode): GoodsDiscountMethod {
  switch (v) {
    case PromotionDiscountMode.AMOUNT:
      return GoodsDiscountMethod.AMOUNT;
    case PromotionDiscountMode.FIXED_PRICE:
      return GoodsDiscountMethod.FIXED_PRICE;
    case PromotionDiscountMode.PERCENT:
    default:
      return GoodsDiscountMethod.PERCENT;
  }
}

function tierDiscountUnitToApi(v: TierDiscountUnit): PromotionDiscountMode {
  return v === TierDiscountUnit.AMOUNT ? PromotionDiscountMode.AMOUNT : PromotionDiscountMode.PERCENT;
}

function tierDiscountUnitFromApi(v?: PromotionDiscountMode): TierDiscountUnit {
  return v === PromotionDiscountMode.AMOUNT ? TierDiscountUnit.AMOUNT : TierDiscountUnit.PERCENT;
}

function groupLogicToApi(v: ProductGroupLogic): PromotionGroupMatchMode {
  return v === ProductGroupLogic.ANY ? PromotionGroupMatchMode.ANY : PromotionGroupMatchMode.ALL;
}

function groupLogicFromApi(v?: PromotionGroupMatchMode): ProductGroupLogic {
  return v === PromotionGroupMatchMode.ANY ? ProductGroupLogic.ANY : ProductGroupLogic.ALL;
}

// ---------------------------------------------------------------------------
// Condition tab (shared by INVOICE_DISCOUNT, ITEM_DISCOUNT, GIFT_ITEM — §8
// feature matrix; TIERED_DISCOUNT/BUY_M_GET_N never call this).
// ---------------------------------------------------------------------------

function buildCondition(form: ProgramFormState): {
  condition?: PromotionConditionInput;
  conditionLines: PromotionLineInput[];
} {
  if (form.conditionType === ConditionType.NONE) {
    return { condition: undefined, conditionLines: [] };
  }

  if (form.conditionType === ConditionType.SPECIFIC_QUANTITY) {
    const conditionLines: PromotionLineInput[] = form.applicableGoods
      .filter((g) => g.itemId)
      .map((g, i) => ({
        role: PromotionLineRole.CONDITION,
        targetType: PromotionTargetType.ITEM,
        targetId: g.itemId,
        quantity: numOrUndefined(g.minQuantity),
        sortOrder: i,
      }));
    return {
      condition: {
        type: PromotionConditionType.SPECIFIC_QUANTITY,
        multiplyGift: form.giftMultiplyByTotal,
      },
      conditionLines,
    };
  }

  // MIN_TOTAL
  const conditionLines: PromotionLineInput[] =
    form.calcBasis === CalcBasis.PRODUCT_GROUP
      ? form.applicableGroups
          .filter((g) => g.groupId)
          .map((g, i) => ({
            role: PromotionLineRole.CONDITION,
            targetType: PromotionTargetType.CATEGORY,
            targetId: g.groupId,
            sortOrder: i,
          }))
      : [];

  return {
    condition: {
      type: PromotionConditionType.MIN_INVOICE_AMOUNT,
      minAmount: numOrUndefined(form.minTotalAmount),
      calcBasis: calcBasisToApi(form.calcBasis),
      groupMatchMode: form.calcBasis === CalcBasis.PRODUCT_GROUP ? groupLogicToApi(form.applicableGroupLogic) : undefined,
      multiplyGift: form.giftMultiplyByTotal,
    },
    conditionLines,
  };
}

function applyConditionToForm(base: ProgramFormState, detail: PromotionProgramDetail): void {
  const conditionLines = detail.groups[0]?.lines.filter((l) => l.role === PromotionLineRole.CONDITION) ?? [];
  base.giftMultiplyByTotal = detail.condition?.multiplyGift ?? false;

  if (!detail.condition || detail.condition.type === PromotionConditionType.NONE) {
    base.conditionType = ConditionType.NONE;
    return;
  }

  if (detail.condition.type === PromotionConditionType.SPECIFIC_QUANTITY) {
    base.conditionType = ConditionType.SPECIFIC_QUANTITY;
    const goods: ApplicableGood[] = conditionLines
      .filter((l) => l.targetType === PromotionTargetType.ITEM)
      .map((l) => ({
        id: crypto.randomUUID(),
        itemId: l.targetId,
        sku: l.targetCode ?? "",
        name: l.targetName ?? "",
        unit: l.unit ?? "",
        minQuantity: l.quantity ?? "",
      }));
    base.applicableGoods = goods.length ? goods : [blankApplicableGood()];
    return;
  }

  // MIN_INVOICE_AMOUNT
  base.conditionType = ConditionType.MIN_TOTAL;
  base.minTotalAmount = detail.condition.minAmount ?? "";
  base.calcBasis = calcBasisFromApi(detail.condition.calcBasis);
  base.applicableGroupLogic = groupLogicFromApi(detail.condition.groupMatchMode);
  if (base.calcBasis === CalcBasis.PRODUCT_GROUP) {
    const groups: ApplicableGroup[] = conditionLines
      .filter((l) => l.targetType === PromotionTargetType.CATEGORY)
      .map((l) => ({
        id: crypto.randomUUID(),
        groupId: l.targetId,
        code: l.targetCode ?? "",
        name: l.targetName ?? "",
      }));
    base.applicableGroups = groups.length ? groups : [blankApplicableGroup()];
  }
}

// ---------------------------------------------------------------------------
// Common fields — name/description/applyTo/date window/days/time/autoApply/
// priority/branchIds — shared by all 5 forms (§8 feature matrix footnote).
// ---------------------------------------------------------------------------

function commonToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const common: Partial<CreatePromotionRequest> = {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    applyTo: applyToToApi(form.applyTo),
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    daysOfWeek: form.daysOfWeek.length ? form.daysOfWeek.map(dayToIso) : undefined,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
    autoApply: form.autoApply,
    priority: form.priority,
    branchIds: form.storeScope === StoreScope.SELECTED ? form.storeIds : undefined,
  };

  if (form.applyTo === FormApplyTo.HAS_BIRTHDAY) {
    common.birthdayMatch = birthdayModeToApi(form.birthdayDateMode);
    if (form.birthdayDateMode === BirthdayDateMode.RANGE) {
      common.birthdayBeforeDays = numOrUndefined(form.birthdayBeforeDays);
      common.birthdayAfterDays = numOrUndefined(form.birthdayAfterDays);
    }
  }
  if (form.applyTo === FormApplyTo.HAS_CARD_TIER) {
    common.cardTierId = form.cardTier || undefined;
  }

  return common;
}

function commonFromDetail(detail: PromotionProgramDetail): ProgramFormState {
  const base = buildInitialFormState();
  base.name = detail.name;
  base.description = detail.description ?? "";
  base.applyTo = applyToFromApi(detail.applyTo);
  base.birthdayDateMode = birthdayModeFromApi(detail.birthdayMatch);
  base.birthdayBeforeDays = detail.birthdayBeforeDays ?? "";
  base.birthdayAfterDays = detail.birthdayAfterDays ?? "";
  base.cardTier = detail.cardTierId ?? "";
  base.startDate = detail.startDate ?? "";
  base.endDate = detail.endDate ?? "";
  base.daysOfWeek = detail.daysOfWeek.map(isoToDay);
  base.startTime = detail.startTime ?? "";
  base.endTime = detail.endTime ?? "";
  base.storeScope = detail.branchIds.length ? StoreScope.SELECTED : StoreScope.ALL_CHAIN;
  base.storeIds = detail.branchIds;
  base.autoApply = detail.autoApply;
  base.priority = detail.priority;
  return base;
}

// ---------------------------------------------------------------------------
// 1. INVOICE_DISCOUNT
// ---------------------------------------------------------------------------

function invoiceDiscountToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const { condition, conditionLines } = buildCondition(form);
  return {
    invoiceScope: applyScopeToApi(form.applyScope),
    discountMode: form.discountType === DiscountType.PERCENT ? PromotionDiscountMode.PERCENT : PromotionDiscountMode.AMOUNT,
    discountValue:
      form.discountType === DiscountType.PERCENT ? numOrUndefined(form.discountPercent) : numOrUndefined(form.discountAmount),
    groups: [{ ordinal: 0, lines: conditionLines }],
    condition,
  };
}

function invoiceDiscountFromDetail(base: ProgramFormState, detail: PromotionProgramDetail): ProgramFormState {
  base.applyScope = applyScopeFromApi(detail.invoiceScope);
  base.discountType = detail.discountMode === PromotionDiscountMode.AMOUNT ? DiscountType.AMOUNT : DiscountType.PERCENT;
  if (base.discountType === DiscountType.PERCENT) {
    base.discountPercent = detail.discountValue ?? "";
    base.discountAmount = "";
  } else {
    base.discountAmount = detail.discountValue ?? "";
    base.discountPercent = "";
  }
  applyConditionToForm(base, detail);
  return base;
}

// ---------------------------------------------------------------------------
// 2. ITEM_DISCOUNT
// ---------------------------------------------------------------------------

function itemDiscountToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const { condition, conditionLines } = buildCondition(form);
  const targetType = form.goodsDiscountScope === GoodsDiscountScope.GROUP ? PromotionTargetType.CATEGORY : PromotionTargetType.PRODUCT;
  const isFixedPrice = form.goodsDiscountMethod === GoodsDiscountMethod.FIXED_PRICE;

  const rewardLines: PromotionLineInput[] = form.goodsDiscountRows
    .filter((r) => r.targetId)
    .map((r, i) => ({
      role: PromotionLineRole.REWARD,
      targetType,
      targetId: r.targetId,
      discountMode: goodsDiscountMethodToApi(form.goodsDiscountMethod),
      discountValue: isFixedPrice ? numOrUndefined(form.goodsFixedPrice) : numOrUndefined(r.value),
      sortOrder: i,
    }));

  return {
    groups: [{ ordinal: 0, lines: [...rewardLines, ...conditionLines] }],
    condition,
  };
}

function itemDiscountFromDetail(base: ProgramFormState, detail: PromotionProgramDetail): ProgramFormState {
  const rewardLines = detail.groups[0]?.lines.filter((l) => l.role === PromotionLineRole.REWARD) ?? [];
  const first = rewardLines[0];

  base.goodsDiscountScope = first?.targetType === PromotionTargetType.CATEGORY ? GoodsDiscountScope.GROUP : GoodsDiscountScope.PRODUCT;
  base.goodsDiscountMethod = goodsDiscountMethodFromApi(first?.discountMode);

  const isFixedPrice = base.goodsDiscountMethod === GoodsDiscountMethod.FIXED_PRICE;
  base.goodsFixedPrice = isFixedPrice ? (first?.discountValue ?? "") : "";

  const rows: GoodsDiscountRow[] = rewardLines.map((l) => ({
    id: crypto.randomUUID(),
    targetId: l.targetId,
    code: l.targetCode ?? "",
    name: l.targetName ?? "",
    value: isFixedPrice ? "" : (l.discountValue ?? ""),
  }));
  base.goodsDiscountRows = rows.length ? rows : [blankGoodsDiscountRow()];

  applyConditionToForm(base, detail);
  return base;
}

// ---------------------------------------------------------------------------
// 3. TIERED_DISCOUNT
// ---------------------------------------------------------------------------

function tieredDiscountToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const targetType = tierTargetToApi(form.tierTarget);
  const groups: PromotionGroupInput[] = form.tierGroups.map((g, gi) => ({
    ordinal: gi,
    name: g.name,
    lines: g.products
      .filter((p) => p.targetId)
      .map((p, i) => ({
        role: PromotionLineRole.REWARD,
        targetType,
        targetId: p.targetId,
        sortOrder: i,
      })),
    tiers: g.tiers
      .filter((t) => t.from !== "")
      .map((t, i) => ({
        fromValue: t.from as number,
        toValue: t.to === "" ? undefined : t.to,
        discountMode: tierDiscountUnitToApi(form.tierDiscountUnit),
        discountValue: numOrUndefined(t.value) ?? 0,
        sortOrder: i,
      })),
  }));

  return {
    tierBasis: PromotionTierBasis.QUANTITY,
    tierScope: form.tierBasis === TierBasis.ALL_ITEMS ? PromotionTierScope.ALL_ITEMS_IN_GROUP : PromotionTierScope.PER_ITEM,
    targetType,
    groups,
  };
}

function tieredDiscountFromDetail(base: ProgramFormState, detail: PromotionProgramDetail): ProgramFormState {
  base.tierBasis = detail.tierScope === PromotionTierScope.ALL_ITEMS_IN_GROUP ? TierBasis.ALL_ITEMS : TierBasis.PER_ITEM;
  base.tierTarget = tierTargetFromApi(detail.targetType);

  const firstTier = detail.groups[0]?.tiers[0];
  base.tierDiscountUnit = tierDiscountUnitFromApi(firstTier?.discountMode);

  const groups: TierGroup[] = detail.groups.map((g, gi) => {
    const products = g.lines
      .filter((l) => l.role === PromotionLineRole.REWARD)
      .map((l) => ({
        id: crypto.randomUUID(),
        targetId: l.targetId,
        code: l.targetCode ?? "",
        name: l.targetName ?? "",
        unit: l.unit ?? "",
      }));
    const tiers = g.tiers.map((t) => ({
      id: crypto.randomUUID(),
      from: t.fromValue,
      to: t.toValue ?? ("" as const),
      value: t.discountValue,
    }));
    return {
      id: crypto.randomUUID(),
      name: g.name ?? `Nhóm ${gi + 1}`,
      products: products.length ? products : [blankTierProduct()],
      tiers: tiers.length ? tiers : [blankTierRow()],
    };
  });
  base.tierGroups = groups.length ? groups : [blankTierGroup(1)];

  return base;
}

// ---------------------------------------------------------------------------
// 4. GIFT_ITEM
// ---------------------------------------------------------------------------

function giftItemToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const { condition, conditionLines } = buildCondition(form);
  const rewardLines: PromotionLineInput[] = form.giftProducts
    .filter((p) => p.itemId)
    .map((p, i) => ({
      role: PromotionLineRole.REWARD,
      targetType: PromotionTargetType.ITEM,
      targetId: p.itemId,
      quantity: numOrUndefined(p.quantity),
      maxUnitPrice: numOrUndefined(p.price),
      sortOrder: i,
    }));

  return {
    giftMode: giftModeToApi(form.giftMode),
    groups: [{ ordinal: 0, lines: [...rewardLines, ...conditionLines] }],
    condition,
  };
}

function giftItemFromDetail(base: ProgramFormState, detail: PromotionProgramDetail): ProgramFormState {
  base.giftMode = giftModeFromApi(detail.giftMode);
  const rewardLines = detail.groups[0]?.lines.filter((l) => l.role === PromotionLineRole.REWARD) ?? [];
  const products: GiftProduct[] = rewardLines.map((l) => ({
    id: crypto.randomUUID(),
    itemId: l.targetId,
    sku: l.targetCode ?? "",
    name: l.targetName ?? "",
    unit: l.unit ?? "",
    price: l.maxUnitPrice ?? "",
    quantity: l.quantity ?? "",
  }));
  base.giftProducts = products.length ? products : [blankGiftProduct()];

  applyConditionToForm(base, detail);
  return base;
}

// ---------------------------------------------------------------------------
// 5. BUY_M_GET_N
// ---------------------------------------------------------------------------

function buyMGetNToDto(form: ProgramFormState): Partial<CreatePromotionRequest> {
  const purchaseTargetType = tierTargetToApi(form.buyGetPurchaseTarget);

  const conditionLines: PromotionLineInput[] = form.buyGetPurchaseRows
    .filter((r) => r.targetId)
    .map((r, i) => ({
      role: PromotionLineRole.CONDITION,
      targetType: purchaseTargetType,
      targetId: r.targetId,
      quantity: numOrUndefined(r.quantity),
      sortOrder: i,
    }));
  const rewardLines: PromotionLineInput[] = form.buyGetGiftRows
    .filter((r) => r.targetId)
    .map((r, i) => ({
      role: PromotionLineRole.REWARD,
      targetType: PromotionTargetType.ITEM,
      targetId: r.targetId,
      quantity: numOrUndefined(r.quantity),
      sortOrder: i,
    }));

  return {
    buyGetPolicy: form.buyGetGiftPolicy === BuyGetGiftPolicy.CHEAPEST ? PromotionBuyGetPolicy.CHEAPEST : PromotionBuyGetPolicy.SPECIFIC,
    buyQuantity: numOrUndefined(form.buyQuantity),
    giftQuantity: numOrUndefined(form.giftQuantity),
    giftMode: giftModeToApi(form.buyGetGiftMode),
    targetType: purchaseTargetType,
    groups: [{ ordinal: 0, lines: [...conditionLines, ...rewardLines] }],
  };
}

function buyMGetNFromDetail(base: ProgramFormState, detail: PromotionProgramDetail): ProgramFormState {
  base.buyGetGiftPolicy = detail.buyGetPolicy === PromotionBuyGetPolicy.CHEAPEST ? BuyGetGiftPolicy.CHEAPEST : BuyGetGiftPolicy.SPECIFIC;
  base.buyQuantity = detail.buyQuantity ?? "";
  base.giftQuantity = detail.giftQuantity ?? "";
  base.buyGetGiftMode = giftModeFromApi(detail.giftMode);
  base.buyGetPurchaseTarget = tierTargetFromApi(detail.targetType);

  const lines = detail.groups[0]?.lines ?? [];
  const toRow = (l: PromotionLineDto): BuyGetRow => ({
    id: crypto.randomUUID(),
    targetId: l.targetId,
    code: l.targetCode ?? "",
    name: l.targetName ?? "",
    unit: l.unit ?? "",
    quantity: l.quantity ?? "",
  });

  const purchaseRows = lines.filter((l) => l.role === PromotionLineRole.CONDITION).map(toRow);
  const giftRows = lines.filter((l) => l.role === PromotionLineRole.REWARD).map(toRow);
  base.buyGetPurchaseRows = purchaseRows.length ? purchaseRows : [blankBuyGetRow()];
  base.buyGetGiftRows = giftRows.length ? giftRows : [blankBuyGetRow()];

  return base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const TO_DTO: Record<PromotionProgramType, (form: ProgramFormState) => Partial<CreatePromotionRequest>> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: invoiceDiscountToDto,
  [PromotionProgramType.ITEM_DISCOUNT]: itemDiscountToDto,
  [PromotionProgramType.TIERED_DISCOUNT]: tieredDiscountToDto,
  [PromotionProgramType.GIFT_ITEM]: giftItemToDto,
  [PromotionProgramType.BUY_M_GET_N]: buyMGetNToDto,
};

const FROM_DETAIL: Record<PromotionProgramType, (base: ProgramFormState, detail: PromotionProgramDetail) => ProgramFormState> = {
  [PromotionProgramType.INVOICE_DISCOUNT]: invoiceDiscountFromDetail,
  [PromotionProgramType.ITEM_DISCOUNT]: itemDiscountFromDetail,
  [PromotionProgramType.TIERED_DISCOUNT]: tieredDiscountFromDetail,
  [PromotionProgramType.GIFT_ITEM]: giftItemFromDetail,
  [PromotionProgramType.BUY_M_GET_N]: buyMGetNFromDetail,
};

/** Rebuilds the full form state for editing an existing promotion — round-trip counterpart of {@link toCreateDto}. */
export function toFormState(detail: PromotionProgramDetail): ProgramFormState {
  const base = commonFromDetail(detail);
  return FROM_DETAIL[detail.type](base, detail);
}

/** Builds the create/update request body — only the fields belonging to `type` are populated (extras get 400 `forbidNonWhitelisted`). */
export function toCreateDto(form: ProgramFormState, type: PromotionProgramType): CreatePromotionRequest {
  return {
    ...commonToDto(form),
    type,
    ...TO_DTO[type](form),
  } as CreatePromotionRequest;
}
