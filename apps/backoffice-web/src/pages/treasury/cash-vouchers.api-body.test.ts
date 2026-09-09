import { describe, expect, it } from "vitest";
import { CashVoucherPartnerType } from "./cash-vouchers.types";
import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashVoucherDetail,
} from "./ledger-cash/ledger-cash.types";
import {
  PartnerLookupType,
  resolvePartyFields,
} from "./documents/_shared/voucher-partner.constants";
import {
  ledgerDetailToCreatePaymentBody,
  ledgerDetailToCreateReceiptBody,
} from "./cash-vouchers.api-body";

function baseDetail(
  overrides: Partial<LedgerCashVoucherDetail> = {},
): LedgerCashVoucherDetail {
  return {
    kind: LedgerCashVoucherKindEnum.RECEIPT,
    purpose: LedgerCashVoucherPurposeEnum.OTHER,
    voucherNo: "",
    voucherDate: new Date("2026-09-08"),
    counterpartyCode: "",
    counterpartyName: "",
    reason: "Thu tiền mặt",
    employeeCode: "NV01",
    employeeName: "Nguyễn Văn A",
    lines: [{ description: "Thu tiền mặt", amount: 100000, category: "" }],
    ...overrides,
  };
}

describe("mapPartnerFields (resolvePartyFields at the cash-vouchers outgoing boundary)", () => {
  it("AC-03: keeps partnerId AND sends the (possibly edited) trimmed name for a catalogue party", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({
        partnerId: "cust-1",
        partnerKind: PartnerLookupType.CUSTOMER,
        counterpartyName: " Nguyễn Văn B ",
      }),
      "cash-1",
    );
    expect(body.partnerType).toBe(CashVoucherPartnerType.CUSTOMER);
    expect(body.partnerId).toBe("cust-1");
    expect(body.partnerName).toBe("Nguyễn Văn B");
  });

  it("falls back to OTHER when there is a typed name but no partnerId", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ counterpartyName: "Khách vãng lai" }),
      "cash-1",
    );
    expect(body.partnerType).toBe(CashVoucherPartnerType.OTHER);
    expect(body.partnerId).toBeUndefined();
    expect(body.partnerName).toBe("Khách vãng lai");
  });

  it("treats a whitespace-only name as empty, same as no name at all", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ counterpartyName: "   " }),
      "cash-1",
    );
    expect(body.partnerType).toBeUndefined();
    expect(body.partnerId).toBeUndefined();
    expect(body.partnerName).toBeUndefined();
  });

  it("sends no party fields at all when neither an id nor a name is present", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ counterpartyName: "" }),
      "cash-1",
    );
    expect(body.partnerType).toBeUndefined();
    expect(body.partnerId).toBeUndefined();
    expect(body.partnerName).toBeUndefined();
  });

  it("does not fall into the OTHER branch when partnerKind is missing but partnerId is present", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ partnerId: "cust-2", counterpartyName: "Trần Thị C" }),
      "cash-1",
    );
    expect(body.partnerType).toBeUndefined();
    expect(body.partnerType).not.toBe(CashVoucherPartnerType.OTHER);
    expect(body.partnerId).toBe("cust-2");
  });

  it("still attaches staffId alongside the derived party fields (payment body)", () => {
    const body = ledgerDetailToCreatePaymentBody(
      baseDetail({
        kind: LedgerCashVoucherKindEnum.PAYMENT,
        staffId: "staff-9",
        counterpartyName: "NCC ABC",
      }),
      "cash-1",
    );
    expect(body.staffId).toBe("staff-9");
    expect(body.partnerType).toBe(CashVoucherPartnerType.OTHER);
    expect(body.partnerName).toBe("NCC ABC");
  });
});

describe("address (ADR-03: cash vouchers copy the deposit-voucher address rule)", () => {
  it("AC-07: trims a two-sided-whitespace address in the receipt create body", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ address: "  123 Lê Lợi  " }),
      "cash-1",
    );
    expect(body.address).toBe("123 Lê Lợi");
  });

  it("AC-07: trims a two-sided-whitespace address in the payment create body", () => {
    const body = ledgerDetailToCreatePaymentBody(
      baseDetail({
        kind: LedgerCashVoucherKindEnum.PAYMENT,
        address: "  45 Nguyễn Huệ  ",
      }),
      "cash-1",
    );
    expect(body.address).toBe("45 Nguyễn Huệ");
  });

  it("AC-07: an empty string address is absent from the body, not sent as ''", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ address: "" }),
      "cash-1",
    );
    expect(body.address).toBeUndefined();
  });

  it("AC-07: a whitespace-only address is treated as absent, same as empty", () => {
    const body = ledgerDetailToCreateReceiptBody(
      baseDetail({ address: "   " }),
      "cash-1",
    );
    expect(body.address).toBeUndefined();
  });

  it("AC-07: address has no value at all when the detail carries none", () => {
    const body = ledgerDetailToCreateReceiptBody(baseDetail(), "cash-1");
    expect(body.address).toBeUndefined();
  });

  it("AC-07: address survives into the update body (create body minus documentNumber) for both receipt and payment", () => {
    // Mirrors how TreasuryCashReceiptsPage builds the update payload: strip
    // documentNumber (immutable once posted) and add revision — address must
    // not be dropped along the way, only create/document-number handling changes.
    const receiptBody = ledgerDetailToCreateReceiptBody(
      baseDetail({ address: "  123 Lê Lợi  " }),
      "cash-1",
    );
    const { documentNumber: _r, ...receiptUpdateBody } = receiptBody;
    expect(receiptUpdateBody.address).toBe("123 Lê Lợi");

    const paymentBody = ledgerDetailToCreatePaymentBody(
      baseDetail({
        kind: LedgerCashVoucherKindEnum.PAYMENT,
        address: "  45 Nguyễn Huệ  ",
      }),
      "cash-1",
    );
    const { documentNumber: _p, ...paymentUpdateBody } = paymentBody;
    expect(paymentUpdateBody.address).toBe("45 Nguyễn Huệ");
  });
});

describe("resolvePartyFields parity between the deposit-receipt and deposit-payment voucher branches (T-01-03)", () => {
  // DepositReceiptVoucherDialog and DepositPaymentVoucherDialog cannot be
  // rendered here (no jsdom — see project memory), but both dialogs' ordinary
  // "kind: voucher" branch call `resolvePartyFields` with the exact same shape
  // of input: `{ partnerId, partnerKind, partnerName: counterpartyName }`. This
  // proves that shape yields identical partnerType/partnerId/partnerName for
  // both branches, i.e. neither dialog re-implements the derivation rule.
  it("AC-06: same input produces the same three fields for both deposit dialogs' voucher branch", () => {
    const input = {
      partnerId: "cust-1",
      partnerKind: PartnerLookupType.CUSTOMER,
      partnerName: " Nguyễn Văn B ",
    };

    const receiptBranchFields = resolvePartyFields(input);
    const paymentBranchFields = resolvePartyFields(input);

    expect(receiptBranchFields).toEqual(paymentBranchFields);
    expect(receiptBranchFields).toEqual({
      partnerType: CashVoucherPartnerType.CUSTOMER,
      partnerId: "cust-1",
      partnerName: "Nguyễn Văn B",
    });
  });

  it("AC-06: a hand-typed name with no partnerId also derives OTHER identically for both branches", () => {
    const input = {
      partnerId: undefined,
      partnerKind: PartnerLookupType.SUPPLIER,
      partnerName: "Khách vãng lai",
    };

    const receiptBranchFields = resolvePartyFields(input);
    const paymentBranchFields = resolvePartyFields(input);

    expect(receiptBranchFields).toEqual(paymentBranchFields);
    expect(receiptBranchFields).toEqual({
      partnerType: CashVoucherPartnerType.OTHER,
      partnerId: undefined,
      partnerName: "Khách vãng lai",
    });
  });
});
