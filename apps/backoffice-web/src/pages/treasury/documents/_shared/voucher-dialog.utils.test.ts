import { describe, expect, it } from "vitest";
import {
  CashPaymentPurpose,
  CashVoucherPartnerType,
} from "../../cash-vouchers.types";
import {
  LedgerCashVoucherPurposeEnum,
} from "../../ledger-cash/ledger-cash.types";
import {
  applyReasonToFirstLine,
  buildPaymentDetailFromForm,
  buildReceiptDetailFromForm,
} from "./voucher-dialog.utils";
import type { VoucherFormLine } from "./voucher-dialog.constants";
import {
  PartnerLookupType,
  resolvePartyFields,
} from "./voucher-partner.constants";

const line = (description: string, amount = 0): VoucherFormLine => ({
  description,
  amount,
  category: "",
  categoryId: undefined,
});

const baseReceiptState = (
  overrides: Partial<Parameters<typeof buildReceiptDetailFromForm>[0]> = {},
): Parameters<typeof buildReceiptDetailFromForm>[0] => ({
  purpose: LedgerCashVoucherPurposeEnum.OTHER,
  partnerKind: PartnerLookupType.CUSTOMER,
  partnerId: "",
  counterpartyCode: "",
  counterpartyName: "",
  payerName: "",
  address: "",
  reason: "",
  staffId: "",
  employeeCode: "",
  employeeName: "",
  reference: "",
  voucherNo: "",
  voucherDate: "2026-09-08",
  lines: [],
  ...overrides,
});

const basePaymentState = (
  overrides: Partial<Parameters<typeof buildPaymentDetailFromForm>[0]> = {},
): Parameters<typeof buildPaymentDetailFromForm>[0] => ({
  ...baseReceiptState(),
  paymentPurpose: CashPaymentPurpose.OTHER,
  ...overrides,
});

// AC-04 / T-01-04: after ADR-04 removed the modal's free-text branch,
// `buildReceiptDetailFromForm` and `buildPaymentDetailFromForm` must derive
// `partnerType` by calling `resolvePartyFields` — the same rule the deposit
// dialogs and `cash-vouchers.api-body.ts` already follow — so there is no
// second derivation left to drift out of sync.
describe("buildReceiptDetailFromForm — partnerType derivation (ADR-04)", () => {
  it("resolves a hand-typed name with no partnerId to OTHER, matching resolvePartyFields", () => {
    const state = baseReceiptState({
      // A stale catalogue kind left over from a previous selection — the
      // trap the ticket calls out: `lookupTypeToPartnerType` alone would
      // read this as CUSTOMER, not OTHER.
      partnerKind: PartnerLookupType.CUSTOMER,
      partnerId: "",
      counterpartyName: "Nguyễn Văn Ba",
    });
    const detail = buildReceiptDetailFromForm(state);
    expect(detail.partnerType).toBe(CashVoucherPartnerType.OTHER);
    expect(detail.partnerType).toBe(
      resolvePartyFields({
        partnerId: state.partnerId,
        partnerKind: state.partnerKind,
        partnerName: state.counterpartyName,
      }).partnerType,
    );
  });

  it("resolves a catalogue party (has partnerId) to its lookup kind", () => {
    const state = baseReceiptState({
      partnerKind: PartnerLookupType.SUPPLIER,
      partnerId: "supplier-1",
      counterpartyName: "Công ty ABC",
    });
    expect(buildReceiptDetailFromForm(state).partnerType).toBe(
      CashVoucherPartnerType.SUPPLIER,
    );
  });

  it("leaves partnerType undefined with neither an id nor a typed name", () => {
    expect(
      buildReceiptDetailFromForm(baseReceiptState()).partnerType,
    ).toBeUndefined();
  });
});

describe("buildPaymentDetailFromForm — partnerType derivation (ADR-04)", () => {
  it("resolves a hand-typed name with no partnerId to OTHER, matching resolvePartyFields", () => {
    const state = basePaymentState({
      partnerKind: PartnerLookupType.CUSTOMER,
      partnerId: "",
      counterpartyName: "Nguyễn Văn Ba",
    });
    const detail = buildPaymentDetailFromForm(state);
    expect(detail.partnerType).toBe(CashVoucherPartnerType.OTHER);
    expect(detail.partnerType).toBe(
      resolvePartyFields({
        partnerId: state.partnerId,
        partnerKind: state.partnerKind,
        partnerName: state.counterpartyName,
      }).partnerType,
    );
  });

  it("resolves a catalogue party (has partnerId) to its lookup kind", () => {
    const state = basePaymentState({
      partnerKind: PartnerLookupType.EMPLOYEE,
      partnerId: "emp-1",
      counterpartyName: "Trần Thị C",
    });
    expect(buildPaymentDetailFromForm(state).partnerType).toBe(
      CashVoucherPartnerType.EMPLOYEE,
    );
  });
});

describe("applyReasonToFirstLine", () => {
  it("fills the first line when its description is empty", () => {
    const out = applyReasonToFirstLine([line("")], "Chi tiền điện tháng 8");
    expect(out[0].description).toBe("Chi tiền điện tháng 8");
  });

  it("leaves a description the user already typed alone", () => {
    const lines = [line("Tiền điện chi nhánh HCM")];
    const out = applyReasonToFirstLine(lines, "Chi tiền điện tháng 8");
    expect(out).toBe(lines);
    expect(out[0].description).toBe("Tiền điện chi nhánh HCM");
  });

  it("treats a whitespace-only description as empty", () => {
    const out = applyReasonToFirstLine([line("   ")], "Chi tiền nước");
    expect(out[0].description).toBe("Chi tiền nước");
  });

  it("does nothing when the reason is blank", () => {
    const lines = [line("")];
    expect(applyReasonToFirstLine(lines, "   ")).toBe(lines);
  });

  it("does not throw on an empty line array", () => {
    expect(applyReasonToFirstLine([], "Chi khác")).toEqual([]);
  });

  it("only touches the first line", () => {
    const out = applyReasonToFirstLine([line(""), line("")], "Chi khác");
    expect(out[0].description).toBe("Chi khác");
    expect(out[1].description).toBe("");
  });

  it("trims the reason before copying", () => {
    const out = applyReasonToFirstLine([line("")], "  Thu nợ khách  ");
    expect(out[0].description).toBe("Thu nợ khách");
  });

  it("returns a new array and never mutates the input", () => {
    // The dialogs hand the result straight to setLines; mutating in place would
    // keep the same reference and skip the re-render.
    const lines = [line("")];
    const out = applyReasonToFirstLine(lines, "Chi khác");
    expect(out).not.toBe(lines);
    expect(lines[0].description).toBe("");
  });

  it("preserves the amount and category already on the line", () => {
    const out = applyReasonToFirstLine(
      [{ description: "", amount: 500_000, category: "Thu khác", categoryId: "c1" }],
      "Thu tiền mặt bán lẻ",
    );
    expect(out[0]).toEqual({
      description: "Thu tiền mặt bán lẻ",
      amount: 500_000,
      category: "Thu khác",
      categoryId: "c1",
    });
  });
});
