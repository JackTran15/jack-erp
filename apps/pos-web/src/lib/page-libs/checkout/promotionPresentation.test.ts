import { describe, expect, it } from "vitest";
import { PromotionDiscountMode, PromotionProgramType } from "@erp/shared-interfaces";
import type { AppliedProgram, EvaluateCartResponse } from "@erp/shared-interfaces";

import {
  buildPromotionRowLabel,
  mapEvaluateResponseToPromotionItems,
  shouldShowPromotionRow,
  skippedReasonLabel,
} from "@erp/pos/lib/page-libs/checkout/promotionPresentation";

/**
 * T-02-01 — mapper gom 3 nguồn của EvaluateCartResponse thành 1 danh sách hiển
 * thị, và nhãn tiếng Việt cho SkippedProgramReason (NFR Ngôn ngữ).
 */
describe("mapEvaluateResponseToPromotionItems", () => {
  const baseResponse: EvaluateCartResponse = {
    subtotal: 0,
    promotionDiscount: 0,
    amountAfterPromotion: 0,
    appliedPrograms: [],
    availablePrograms: [],
    skippedPrograms: [],
  };

  it("maps applied programs as selected", () => {
    const items = mapEvaluateResponseToPromotionItems({
      ...baseResponse,
      appliedPrograms: [
        {
          programId: "P1",
          code: "KM01",
          name: "GIÀY NAM ONSALE 30%",
          type: PromotionProgramType.INVOICE_DISCOUNT,
          priority: 10,
          discountAmount: 448_500,
          lineDiscounts: [],
          gifts: [],
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "P1",
      name: "GIÀY NAM ONSALE 30%",
      selected: true,
    });
    expect(items[0].disabled).toBeUndefined();
  });

  it("maps available programs as unselected and tickable", () => {
    const items = mapEvaluateResponseToPromotionItems({
      ...baseResponse,
      availablePrograms: [
        {
          programId: "P2",
          code: "KM02",
          name: "GIÀY NAM ONSALE 50%",
          type: PromotionProgramType.ITEM_DISCOUNT,
          autoApply: false,
          estimatedDiscount: 100_000,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].selected).toBeUndefined();
    expect(items[0].disabled).toBeUndefined();
  });

  it("maps skipped programs as disabled with a Vietnamese reason", () => {
    const items = mapEvaluateResponseToPromotionItems({
      ...baseResponse,
      skippedPrograms: [
        { programId: "P3", name: "GIÀY NAM ONSALE 70%", reason: "CONDITION_NOT_MET" },
      ],
    });
    expect(items[0].disabled).toBe(true);
    expect(items[0].reason).toBe("Chưa đủ điều kiện");
  });
});

describe("skippedReasonLabel", () => {
  const applied: AppliedProgram[] = [
    {
      programId: "WINNER",
      code: "KM01",
      name: "GIÀY NAM ONSALE 30%",
      type: PromotionProgramType.INVOICE_DISCOUNT,
      priority: 10,
      discountAmount: 448_500,
      lineDiscounts: [],
      gifts: [],
    },
  ];

  it("interpolates the winning program's name for RESOURCE_TAKEN", () => {
    const label = skippedReasonLabel(
      { programId: "P4", name: "GIÀY NAM ONSALE 50%", reason: "RESOURCE_TAKEN", takenBy: "WINNER" },
      applied,
    );
    expect(label).toBe("Đã bị chương trình GIÀY NAM ONSALE 30% giành mất");
  });

  it("falls back to a generic sentence when takenBy has no match, without leaking the raw id", () => {
    const label = skippedReasonLabel(
      { programId: "P5", name: "GIÀY NAM ONSALE 50%", reason: "RESOURCE_TAKEN", takenBy: "ghost-id" },
      applied,
    );
    expect(label).toBe("Đã bị chương trình khác giành mất");
    expect(label).not.toContain("ghost-id");
  });

  it("has every SkippedProgramReason covered — a missing key is caught by tsc, this just documents it", () => {
    const reasons = [
      "STOPPED",
      "DATE_WINDOW",
      "DAY_OF_WEEK",
      "TIME_OF_DAY",
      "BRANCH_SCOPE",
      "CUSTOMER_SCOPE",
      "CONDITION_NOT_MET",
      "NOT_SELECTED",
    ] as const;
    for (const reason of reasons) {
      const label = skippedReasonLabel({ programId: "X", name: "X", reason }, []);
      expect(label).not.toBe(reason);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

/**
 * T-07-02 — dòng "Khuyến mại" ở panel thanh toán: ẩn khi 0đ, hiện "(X%)" chỉ
 * khi đúng 1 CTKM INVOICE_DISCOUNT kiểu PERCENT đang áp một mình.
 */
describe("shouldShowPromotionRow", () => {
  const baseResponse: EvaluateCartResponse = {
    subtotal: 100_000,
    promotionDiscount: 0,
    amountAfterPromotion: 100_000,
    appliedPrograms: [],
    availablePrograms: [],
    skippedPrograms: [],
  };

  it("returns false when promotionDiscount is 0", () => {
    expect(shouldShowPromotionRow(baseResponse)).toBe(false);
  });

  it("returns true when promotionDiscount is positive", () => {
    expect(shouldShowPromotionRow({ ...baseResponse, promotionDiscount: 30_000 })).toBe(true);
  });
});

describe("buildPromotionRowLabel", () => {
  const invoiceDiscountProgram = (
    overrides: Partial<AppliedProgram> = {},
  ): AppliedProgram => ({
    programId: "P1",
    code: "KM01",
    name: "Giảm 30%",
    type: PromotionProgramType.INVOICE_DISCOUNT,
    priority: 10,
    discountAmount: 30_000,
    lineDiscounts: [],
    gifts: [],
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 30,
    ...overrides,
  });

  const baseResponse: EvaluateCartResponse = {
    subtotal: 100_000,
    promotionDiscount: 0,
    amountAfterPromotion: 100_000,
    appliedPrograms: [],
    availablePrograms: [],
    skippedPrograms: [],
  };

  it("shows the percent when exactly 1 INVOICE_DISCOUNT PERCENT program is applied", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [invoiceDiscountProgram()],
    });
    expect(label).toBe("Khuyến mại (30%)");
  });

  it("falls back to the flat label for an INVOICE_DISCOUNT AMOUNT program", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [
        invoiceDiscountProgram({ discountMode: PromotionDiscountMode.AMOUNT, discountValue: 50_000 }),
      ],
    });
    expect(label).toBe("Khuyến mại");
  });

  it("falls back to the flat label for an INVOICE_DISCOUNT FIXED_PRICE program", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [
        invoiceDiscountProgram({ discountMode: PromotionDiscountMode.FIXED_PRICE, discountValue: 200_000 }),
      ],
    });
    expect(label).toBe("Khuyến mại");
  });

  it("falls back to the flat label when appliedPrograms is empty (guards the array-access short-circuit)", () => {
    const label = buildPromotionRowLabel({ ...baseResponse, appliedPrograms: [] });
    expect(label).toBe("Khuyến mại");
  });

  it("falls back to the flat label instead of rendering 'undefined%' when discountValue is missing", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [invoiceDiscountProgram({ discountValue: undefined })],
    });
    expect(label).toBe("Khuyến mại");
  });

  it("falls back to the flat label for a non-INVOICE_DISCOUNT type, even with a percent-shaped value", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [
        {
          programId: "P2",
          code: "KM02",
          name: "Giảm mặt hàng",
          type: PromotionProgramType.ITEM_DISCOUNT,
          priority: 10,
          discountAmount: 10_000,
          lineDiscounts: [],
          gifts: [],
        },
      ],
    });
    expect(label).toBe("Khuyến mại");
  });

  it("falls back to the flat label when 2+ programs are applied together", () => {
    const label = buildPromotionRowLabel({
      ...baseResponse,
      appliedPrograms: [
        invoiceDiscountProgram(),
        {
          programId: "P2",
          code: "KM02",
          name: "Giảm mặt hàng",
          type: PromotionProgramType.ITEM_DISCOUNT,
          priority: 20,
          discountAmount: 10_000,
          lineDiscounts: [],
          gifts: [],
        },
      ],
    });
    expect(label).toBe("Khuyến mại");
  });
});

/**
 * T-07-04 — gộp lại 3 case của UOW-07 dưới dạng cả `shouldShowPromotionRow`
 * lẫn `buildPromotionRowLabel` cùng đọc một `EvaluateCartResponse`, đúng như
 * cách `PaymentSummaryBlock.tsx` dùng cả hai hàm cho cùng một `data`.
 */
describe("T-07-04 — regression: shouldShowPromotionRow + buildPromotionRowLabel together", () => {
  it("0 chương trình áp / promotionDiscount = 0 ⇒ dòng không được render", () => {
    const data: EvaluateCartResponse = {
      subtotal: 100_000,
      promotionDiscount: 0,
      amountAfterPromotion: 100_000,
      appliedPrograms: [],
      availablePrograms: [],
      skippedPrograms: [],
    };
    expect(shouldShowPromotionRow(data)).toBe(false);
  });

  it("promotionDiscount > 0 với 1 CTKM PERCENT ⇒ hiện dòng, label kèm %", () => {
    const applied: AppliedProgram = {
      programId: "P1",
      code: "KM01",
      name: "Giảm 30%",
      type: PromotionProgramType.INVOICE_DISCOUNT,
      priority: 10,
      discountAmount: 30_000,
      lineDiscounts: [],
      gifts: [],
      discountMode: PromotionDiscountMode.PERCENT,
      discountValue: 30,
    };
    const data: EvaluateCartResponse = {
      subtotal: 100_000,
      promotionDiscount: 30_000,
      amountAfterPromotion: 70_000,
      appliedPrograms: [applied],
      availablePrograms: [],
      skippedPrograms: [],
    };
    expect(shouldShowPromotionRow(data)).toBe(true);
    expect(buildPromotionRowLabel(data)).toBe("Khuyến mại (30%)");
  });

  it("2 chương trình cùng áp ⇒ hiện dòng, label phẳng không có %", () => {
    const invoiceDiscount: AppliedProgram = {
      programId: "P1",
      code: "KM01",
      name: "Giảm 30%",
      type: PromotionProgramType.INVOICE_DISCOUNT,
      priority: 10,
      discountAmount: 30_000,
      lineDiscounts: [],
      gifts: [],
      discountMode: PromotionDiscountMode.PERCENT,
      discountValue: 30,
    };
    const itemDiscount: AppliedProgram = {
      programId: "P2",
      code: "KM02",
      name: "Giảm mặt hàng",
      type: PromotionProgramType.ITEM_DISCOUNT,
      priority: 20,
      discountAmount: 10_000,
      lineDiscounts: [],
      gifts: [],
    };
    const data: EvaluateCartResponse = {
      subtotal: 100_000,
      promotionDiscount: 40_000,
      amountAfterPromotion: 60_000,
      appliedPrograms: [invoiceDiscount, itemDiscount],
      availablePrograms: [],
      skippedPrograms: [],
    };
    expect(shouldShowPromotionRow(data)).toBe(true);
    expect(buildPromotionRowLabel(data)).toBe("Khuyến mại");
  });
});
