import { describe, expect, it } from "vitest";
import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionStatus,
  PromotionDiscountMode,
  PromotionInvoiceScope,
  PromotionLineRole,
  PromotionTargetType,
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionGiftMode,
  PromotionBuyGetPolicy,
  type PromotionProgramDetail,
} from "@erp/shared-interfaces";
import { toCreateDto, toFormState } from "./promotion.mapper";
import {
  ApplyScope,
  BuyGetGiftPolicy,
  CalcBasis,
  ConditionType,
  DiscountType,
  GiftMode,
  GoodsDiscountMethod,
  GoodsDiscountScope,
  ProductGroupLogic,
  TierBasis,
  TierDiscountUnit,
  TierTarget,
} from "../programs/program-form.types";

function baseDetail(
  overrides: Partial<PromotionProgramDetail> & Pick<PromotionProgramDetail, "type" | "groups">,
): PromotionProgramDetail {
  return {
    id: "prog-1",
    code: "KM000001",
    name: "Test promotion",
    description: "Mo ta",
    status: PromotionStatus.TRACKING,
    priority: 50,
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    customerGroupIds: [],
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: "08:00",
    endTime: "22:00",
    autoApply: true,
    branchIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "user-1",
    ...overrides,
  };
}

describe("promotion.mapper round-trip", () => {
  it("INVOICE_DISCOUNT: condition SPECIFIC_QUANTITY + PERCENT discount", () => {
    const detail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY,
      discountMode: PromotionDiscountMode.PERCENT,
      discountValue: 15,
      groups: [
        {
          id: "g0",
          ordinal: 0,
          lines: [
            {
              id: "l1",
              role: PromotionLineRole.CONDITION,
              targetType: PromotionTargetType.ITEM,
              targetId: "item-1",
              targetCode: "SKU1",
              targetName: "Item 1",
              unit: "cái",
              quantity: 3,
              sortOrder: 0,
            },
          ],
          tiers: [],
        },
      ],
      condition: { type: PromotionConditionType.SPECIFIC_QUANTITY, multiplyGift: false },
    });

    const form = toFormState(detail);
    expect(form.applyScope).toBe(ApplyScope.NON_PROMO_ONLY);
    expect(form.discountType).toBe(DiscountType.PERCENT);
    expect(form.discountPercent).toBe(15);
    expect(form.conditionType).toBe(ConditionType.SPECIFIC_QUANTITY);
    expect(form.applicableGoods).toHaveLength(1);
    expect(form.applicableGoods[0]).toMatchObject({ itemId: "item-1", sku: "SKU1", minQuantity: 3 });

    // Scope lock (ADR-01): even though the loaded program hydrated
    // form.applyScope to NON_PROMO_ONLY above, the save path must ignore it
    // and always emit ALL_ITEMS (AC-01/AC-02).
    const dto = toCreateDto(form, PromotionProgramType.INVOICE_DISCOUNT);
    expect(dto.invoiceScope).toBe(PromotionInvoiceScope.ALL_ITEMS);
    expect(dto.discountMode).toBe(PromotionDiscountMode.PERCENT);
    expect(dto.discountValue).toBe(15);
    expect(dto.condition).toMatchObject({ type: PromotionConditionType.SPECIFIC_QUANTITY });
    expect(dto.groups[0].lines).toHaveLength(1);
    expect(dto.groups[0].lines?.[0]).toMatchObject({
      role: PromotionLineRole.CONDITION,
      targetType: PromotionTargetType.ITEM,
      targetId: "item-1",
      quantity: 3,
    });
  });

  it("INVOICE_DISCOUNT: accruePoints round-trips true/false, and defaults to false when absent from the response (T-02-06)", () => {
    const checkedDetail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      accruePoints: true,
      groups: [{ id: "g0", ordinal: 0, lines: [], tiers: [] }],
    });
    const checkedForm = toFormState(checkedDetail);
    expect(checkedForm.accruePoints).toBe(true);
    expect(toCreateDto(checkedForm, PromotionProgramType.INVOICE_DISCOUNT).accruePoints).toBe(true);

    const uncheckedDetail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      accruePoints: false,
      groups: [{ id: "g0", ordinal: 0, lines: [], tiers: [] }],
    });
    const uncheckedForm = toFormState(uncheckedDetail);
    expect(uncheckedForm.accruePoints).toBe(false);
    expect(toCreateDto(uncheckedForm, PromotionProgramType.INVOICE_DISCOUNT).accruePoints).toBe(false);

    // A stale cached response from before this migration ran would omit the field entirely —
    // must default to false, not crash and not stay undefined.
    const staleDetail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      groups: [{ id: "g0", ordinal: 0, lines: [], tiers: [] }],
    });
    const staleForm = toFormState(staleDetail);
    expect(staleForm.accruePoints).toBe(false);
  });

  it("ITEM_DISCOUNT: PRODUCT-scope reward lines + PRODUCT_GROUP condition", () => {
    const detail = baseDetail({
      type: PromotionProgramType.ITEM_DISCOUNT,
      groups: [
        {
          id: "g0",
          ordinal: 0,
          lines: [
            {
              id: "l1",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.PRODUCT,
              targetId: "prod-1",
              targetCode: "P1",
              targetName: "Product 1",
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 20,
              sortOrder: 0,
            },
            {
              id: "l2",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.PRODUCT,
              targetId: "prod-2",
              targetCode: "P2",
              targetName: "Product 2",
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 20,
              sortOrder: 1,
            },
            {
              id: "l3",
              role: PromotionLineRole.CONDITION,
              targetType: PromotionTargetType.CATEGORY,
              targetId: "cat-1",
              targetCode: "C1",
              targetName: "Category 1",
              sortOrder: 0,
            },
          ],
          tiers: [],
        },
      ],
      condition: {
        type: PromotionConditionType.MIN_INVOICE_AMOUNT,
        minAmount: 500_000,
        calcBasis: PromotionCalcBasis.ITEM_CATEGORIES,
        groupMatchMode: PromotionGroupMatchMode.ANY,
        multiplyGift: false,
      },
    });

    const form = toFormState(detail);
    expect(form.goodsDiscountScope).toBe(GoodsDiscountScope.PRODUCT);
    expect(form.goodsDiscountMethod).toBe(GoodsDiscountMethod.PERCENT);
    expect(form.goodsDiscountRows).toHaveLength(2);
    expect(form.goodsDiscountRows.map((r) => r.targetId)).toEqual(["prod-1", "prod-2"]);
    expect(form.goodsDiscountRows[0].value).toBe(20);
    expect(form.conditionType).toBe(ConditionType.MIN_TOTAL);
    expect(form.minTotalAmount).toBe(500_000);
    expect(form.calcBasis).toBe(CalcBasis.PRODUCT_GROUP);
    expect(form.applicableGroupLogic).toBe(ProductGroupLogic.ANY);
    expect(form.applicableGroups).toHaveLength(1);
    expect(form.applicableGroups[0]).toMatchObject({ groupId: "cat-1", code: "C1" });

    const dto = toCreateDto(form, PromotionProgramType.ITEM_DISCOUNT);
    const rewardLines = dto.groups[0].lines?.filter((l) => l.role === PromotionLineRole.REWARD) ?? [];
    const conditionLines = dto.groups[0].lines?.filter((l) => l.role === PromotionLineRole.CONDITION) ?? [];
    expect(rewardLines).toHaveLength(2);
    expect(rewardLines.every((l) => l.targetType === PromotionTargetType.PRODUCT && l.discountValue === 20)).toBe(true);
    expect(rewardLines.map((l) => l.targetId)).toEqual(["prod-1", "prod-2"]);
    expect(conditionLines).toEqual([
      expect.objectContaining({ targetType: PromotionTargetType.CATEGORY, targetId: "cat-1" }),
    ]);
    expect(dto.condition).toMatchObject({
      type: PromotionConditionType.MIN_INVOICE_AMOUNT,
      minAmount: 500_000,
      calcBasis: PromotionCalcBasis.ITEM_CATEGORIES,
      groupMatchMode: PromotionGroupMatchMode.ANY,
    });
  });

  it("TIERED_DISCOUNT: 2 groups, VARIANT target, PER_ITEM scope", () => {
    const detail = baseDetail({
      type: PromotionProgramType.TIERED_DISCOUNT,
      tierBasis: PromotionTierBasis.QUANTITY,
      tierScope: PromotionTierScope.PER_ITEM,
      targetType: PromotionTargetType.ITEM,
      groups: [
        {
          id: "g0",
          ordinal: 0,
          name: "Nhóm 1",
          lines: [
            {
              id: "l1",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: "item-1",
              targetCode: "SKU1",
              targetName: "Item 1",
              unit: "cái",
              sortOrder: 0,
            },
          ],
          tiers: [
            { id: "t1", fromValue: 1, toValue: 4, discountMode: PromotionDiscountMode.PERCENT, discountValue: 5, sortOrder: 0 },
            { id: "t2", fromValue: 5, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10, sortOrder: 1 },
          ],
        },
        {
          id: "g1",
          ordinal: 1,
          name: "Nhóm 2",
          lines: [
            {
              id: "l2",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: "item-2",
              targetCode: "SKU2",
              targetName: "Item 2",
              unit: "cái",
              sortOrder: 0,
            },
          ],
          tiers: [{ id: "t3", fromValue: 1, discountMode: PromotionDiscountMode.PERCENT, discountValue: 8, sortOrder: 0 }],
        },
      ],
    });

    const form = toFormState(detail);
    expect(form.tierTarget).toBe(TierTarget.VARIANT);
    expect(form.tierBasis).toBe(TierBasis.PER_ITEM);
    expect(form.tierDiscountUnit).toBe(TierDiscountUnit.PERCENT);
    expect(form.tierGroups).toHaveLength(2);
    expect(form.tierGroups[0].products[0]).toMatchObject({ targetId: "item-1", code: "SKU1" });
    expect(form.tierGroups[0].tiers).toEqual([
      expect.objectContaining({ from: 1, to: 4, value: 5 }),
      expect.objectContaining({ from: 5, to: "", value: 10 }),
    ]);
    expect(form.tierGroups[1].products[0]).toMatchObject({ targetId: "item-2" });
    expect(form.tierGroups[1].tiers).toEqual([expect.objectContaining({ from: 1, to: "", value: 8 })]);

    const dto = toCreateDto(form, PromotionProgramType.TIERED_DISCOUNT);
    expect(dto.tierBasis).toBe(PromotionTierBasis.QUANTITY);
    expect(dto.tierScope).toBe(PromotionTierScope.PER_ITEM);
    expect(dto.targetType).toBe(PromotionTargetType.ITEM);
    expect(dto.groups).toHaveLength(2);
    expect(dto.groups[0].ordinal).toBe(0);
    expect(dto.groups[1].ordinal).toBe(1);
    expect(dto.groups[0].lines?.[0]).toMatchObject({ targetType: PromotionTargetType.ITEM, targetId: "item-1" });
    expect(dto.groups[0].tiers).toEqual([
      expect.objectContaining({ fromValue: 1, toValue: 4, discountValue: 5 }),
      expect.objectContaining({ fromValue: 5, toValue: undefined, discountValue: 10 }),
    ]);
    expect(dto.groups[1].lines?.[0]).toMatchObject({ targetId: "item-2" });
    expect(dto.groups[1].tiers).toEqual([expect.objectContaining({ fromValue: 1, discountValue: 8 })]);
  });

  it("GIFT_ITEM: reward line + MIN_INVOICE_AMOUNT condition with multiplyGift", () => {
    const detail = baseDetail({
      type: PromotionProgramType.GIFT_ITEM,
      giftMode: PromotionGiftMode.ONE_OF,
      groups: [
        {
          id: "g0",
          ordinal: 0,
          lines: [
            {
              id: "l1",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: "gift-1",
              targetCode: "G1",
              targetName: "Gift 1",
              unit: "cái",
              quantity: 1,
              maxUnitPrice: 100_000,
              sortOrder: 0,
            },
          ],
          tiers: [],
        },
      ],
      condition: {
        type: PromotionConditionType.MIN_INVOICE_AMOUNT,
        minAmount: 200_000,
        calcBasis: PromotionCalcBasis.ALL_ITEMS,
        multiplyGift: true,
      },
    });

    const form = toFormState(detail);
    expect(form.giftMode).toBe(GiftMode.ONE);
    expect(form.giftProducts).toHaveLength(1);
    expect(form.giftProducts[0]).toMatchObject({ itemId: "gift-1", sku: "G1", price: 100_000, quantity: 1 });
    expect(form.conditionType).toBe(ConditionType.MIN_TOTAL);
    expect(form.minTotalAmount).toBe(200_000);
    expect(form.giftMultiplyByTotal).toBe(true);

    const dto = toCreateDto(form, PromotionProgramType.GIFT_ITEM);
    expect(dto.giftMode).toBe(PromotionGiftMode.ONE_OF);
    expect(dto.groups[0].lines?.[0]).toMatchObject({
      role: PromotionLineRole.REWARD,
      targetType: PromotionTargetType.ITEM,
      targetId: "gift-1",
      quantity: 1,
      maxUnitPrice: 100_000,
    });
    expect(dto.condition).toMatchObject({
      type: PromotionConditionType.MIN_INVOICE_AMOUNT,
      minAmount: 200_000,
      multiplyGift: true,
    });
  });

  it("BUY_M_GET_N: condition + reward lines, global buyQuantity/giftQuantity", () => {
    const detail = baseDetail({
      type: PromotionProgramType.BUY_M_GET_N,
      buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC,
      buyQuantity: 3,
      giftQuantity: 1,
      giftMode: PromotionGiftMode.ONE_OF,
      targetType: PromotionTargetType.ITEM,
      groups: [
        {
          id: "g0",
          ordinal: 0,
          lines: [
            {
              id: "l1",
              role: PromotionLineRole.CONDITION,
              targetType: PromotionTargetType.ITEM,
              targetId: "item-1",
              targetCode: "SKU1",
              targetName: "Item 1",
              unit: "cái",
              quantity: 2,
              sortOrder: 0,
            },
            {
              id: "l2",
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: "gift-1",
              targetCode: "G1",
              targetName: "Gift 1",
              unit: "cái",
              quantity: 1,
              sortOrder: 0,
            },
          ],
          tiers: [],
        },
      ],
    });

    const form = toFormState(detail);
    expect(form.buyGetGiftPolicy).toBe(BuyGetGiftPolicy.SPECIFIC);
    expect(form.buyQuantity).toBe(3);
    expect(form.giftQuantity).toBe(1);
    expect(form.buyGetGiftMode).toBe(GiftMode.ONE);
    expect(form.buyGetPurchaseTarget).toBe(TierTarget.VARIANT);
    expect(form.buyGetPurchaseRows).toHaveLength(1);
    expect(form.buyGetPurchaseRows[0]).toMatchObject({ targetId: "item-1", quantity: 2 });
    expect(form.buyGetGiftRows).toHaveLength(1);
    expect(form.buyGetGiftRows[0]).toMatchObject({ targetId: "gift-1", quantity: 1 });

    const dto = toCreateDto(form, PromotionProgramType.BUY_M_GET_N);
    expect(dto.buyGetPolicy).toBe(PromotionBuyGetPolicy.SPECIFIC);
    expect(dto.buyQuantity).toBe(3);
    expect(dto.giftQuantity).toBe(1);
    expect(dto.giftMode).toBe(PromotionGiftMode.ONE_OF);
    expect(dto.targetType).toBe(PromotionTargetType.ITEM);
    const conditionLines = dto.groups[0].lines?.filter((l) => l.role === PromotionLineRole.CONDITION) ?? [];
    const rewardLines = dto.groups[0].lines?.filter((l) => l.role === PromotionLineRole.REWARD) ?? [];
    expect(conditionLines).toEqual([expect.objectContaining({ targetId: "item-1", quantity: 2 })]);
    expect(rewardLines).toEqual([expect.objectContaining({ targetId: "gift-1", quantity: 1 })]);
    // BUY_M_GET_N has no condition tab (§8 feature matrix) and no invoiceScope/discountMode.
    expect(dto.condition).toBeUndefined();
    expect(dto.invoiceScope).toBeUndefined();
    expect(dto.discountMode).toBeUndefined();
  });

  it("carries the record's actual status into the form (not the TRACKING default)", () => {
    const detail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      status: PromotionStatus.STOPPED,
      invoiceScope: PromotionInvoiceScope.ALL_ITEMS,
      discountMode: PromotionDiscountMode.PERCENT,
      discountValue: 10,
      groups: [{ id: "g0", ordinal: 0, lines: [], tiers: [] }],
    });

    expect(toFormState(detail).status).toBe(PromotionStatus.STOPPED);
  });

  it("does not send fields belonging to other promotion types (forbidNonWhitelisted safety)", () => {
    const detail = baseDetail({
      type: PromotionProgramType.INVOICE_DISCOUNT,
      invoiceScope: PromotionInvoiceScope.ALL_ITEMS,
      discountMode: PromotionDiscountMode.AMOUNT,
      discountValue: 10_000,
      groups: [{ id: "g0", ordinal: 0, lines: [], tiers: [] }],
    });

    const dto = toCreateDto(toFormState(detail), PromotionProgramType.INVOICE_DISCOUNT);
    expect(dto.giftMode).toBeUndefined();
    expect(dto.buyGetPolicy).toBeUndefined();
    expect(dto.tierBasis).toBeUndefined();
  });
});
