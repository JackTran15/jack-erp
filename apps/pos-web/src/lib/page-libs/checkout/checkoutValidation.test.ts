import { describe, expect, it } from "vitest";

import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type { PaymentAccountRow } from "@erp/pos/interfaces/account.interface";
import { PaymentMethodEnum } from "@erp/pos/constants/checkout.constant";
import { createPaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import {
  CHECKOUT_ERROR_CODES,
  validateCheckout,
  type CheckoutValidationInput,
} from "@erp/pos/lib/page-libs/checkout/checkoutValidation";

const fakeCustomer: CustomerRow = {
  id: "cus_1",
  name: "Khách A",
  phone: "0900000000",
  email: null,
} as CustomerRow;

const baseInput: CheckoutValidationInput = {
  hasAnyCartLines: true,
  debt: false,
  keepChange: false,
  selectedCustomer: null,
  purchaseCart: [],
  settlementGrandTotal: 100_000,
  settlementAbs: 100_000,
  totalPaid: 100_000,
  changeAmount: 0,
  shortageAmount: 0,
  paymentLines: [],
  paymentAccounts: [],
};

const makeAccount = (
  id: string,
  paymentMethod: PaymentAccountRow["paymentMethod"],
  depositLinked: boolean,
): PaymentAccountRow => ({
  id,
  paymentMethod,
  depositAccountName: depositLinked ? "Quỹ VCB" : null,
  bankName: depositLinked ? "Vietcombank" : null,
  bankCode: depositLinked ? "VCB" : null,
  accountNumber: depositLinked ? "0123456789" : null,
  label: depositLinked ? null : "Chuyển khoản",
  depositLinked,
  sortOrder: 0,
});

const makeReturnCreditLine = (qty: number, maxQty: number): CartLine => ({
  lineId: "l1",
  itemId: "i1",
  name: "Item",
  code: "C1",
  unit: "cái",
  unitPrice: 10_000,
  qty,
  locationId: "loc1",
  maxQty,
  isReturnCredit: true,
});

describe("validateCheckout", () => {
  it("returns EMPTY_CART when cart is empty", () => {
    const result = validateCheckout({ ...baseInput, hasAnyCartLines: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.EMPTY_CART);
      expect(result.message).toBe("Giỏ hàng trống.");
    }
  });

  it("returns DEBT_REQUIRES_CUSTOMER when debt is true but no customer", () => {
    const result = validateCheckout({ ...baseInput, debt: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.DEBT_REQUIRES_CUSTOMER);
      expect(result.message).toBe(
        "Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.",
      );
    }
  });

  it("returns RETURN_QTY_EXCEEDS_ORIGIN when a return credit line exceeds maxQty", () => {
    const result = validateCheckout({
      ...baseInput,
      purchaseCart: [makeReturnCreditLine(3, 2)],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.RETURN_QTY_EXCEEDS_ORIGIN);
      expect(result.message).toBe(
        "Số lượng hoàn trả vượt quá số lượng được phép trên hóa đơn gốc. Vui lòng kiểm tra lại.",
      );
    }
  });

  it("returns UNDERPAID_SALE when sale is underpaid and no keepChange/debt", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: 100_000,
      changeAmount: 0,
      shortageAmount: 50_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.UNDERPAID_SALE);
      expect(result.message).toBe(
        "Bạn chưa nhập đủ số tiền cần thanh toán. Vui lòng kiểm tra lại!",
      );
    }
  });

  it("returns UNDERPAID_RETURN when return is underpaid", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 50_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.UNDERPAID_RETURN);
      expect(result.message).toBe(
        "Bạn chưa nhập đủ số tiền cần trả khách. Vui lòng kiểm tra lại!",
      );
    }
  });

  it("a refund line short of the full amount is still blocked (AC-15)", () => {
    // Không còn ô "Tính vào công nợ" để miễn: dòng hoàn phải mang TOÀN BỘ khoản
    // hoàn, BE mới là nơi tách phần cấn trừ công nợ ra khỏi phần chi thật.
    const result = validateCheckout({
      ...baseInput,
      selectedCustomer: fakeCustomer,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.UNDERPAID_RETURN);
    }
  });

  it("a sale on debt without a customer is blocked (DEBT_REQUIRES_CUSTOMER)", () => {
    const result = validateCheckout({
      ...baseInput,
      debt: true,
      selectedCustomer: null,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.DEBT_REQUIRES_CUSTOMER);
    }
  });

  it("returns OVERPAID_RETURN when return is overpaid", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 150_000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CHECKOUT_ERROR_CODES.OVERPAID_RETURN);
      expect(result.message).toBe(
        "Số tiền nhập trong hình thức đổi trả đang vượt quá số tiền cần trả lại khách. Vui lòng kiểm tra lại!",
      );
    }
  });

  it("returns ok for the happy path (full sale paid)", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: 100_000,
      changeAmount: 0,
      shortageAmount: 0,
      totalPaid: 100_000,
    });
    expect(result.ok).toBe(true);
  });

  it("debt + selectedCustomer (debtCovered) does not trigger UNDERPAID_SALE", () => {
    const result = validateCheckout({
      ...baseInput,
      debt: true,
      selectedCustomer: fakeCustomer,
      settlementGrandTotal: 100_000,
      changeAmount: 0,
      shortageAmount: 50_000,
    });
    expect(result.ok).toBe(true);
  });

  it("debt + selectedCustomer (debtCovered) does not trigger UNDERPAID_RETURN", () => {
    const result = validateCheckout({
      ...baseInput,
      debt: true,
      selectedCustomer: fakeCustomer,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 50_000,
    });
    expect(result.ok).toBe(true);
  });

  it("keepChange = true skips UNDERPAID_SALE", () => {
    const result = validateCheckout({
      ...baseInput,
      keepChange: true,
      settlementGrandTotal: 100_000,
      shortageAmount: 50_000,
    });
    expect(result.ok).toBe(true);
  });

  it("keepChange = true skips UNDERPAID_RETURN", () => {
    const result = validateCheckout({
      ...baseInput,
      keepChange: true,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 50_000,
    });
    expect(result.ok).toBe(true);
  });

  it("settlementGrandTotal === 0 passes (no sale-underpaid, no return checks)", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: 0,
      settlementAbs: 0,
      totalPaid: 0,
      changeAmount: 0,
      shortageAmount: 0,
    });
    expect(result.ok).toBe(true);
  });

  it("does not produce OVERPAID_RETURN when totalPaid === settlementAbs exactly", () => {
    const result = validateCheckout({
      ...baseInput,
      settlementGrandTotal: -100_000,
      settlementAbs: 100_000,
      totalPaid: 100_000,
    });
    expect(result.ok).toBe(true);
  });

  it("returns PAYMENT_ACCOUNT_NOT_LINKED when a transfer line points at an account with no deposit fund", () => {
    const account = makeAccount("acc-unlinked", "bank_transfer", false);
    const result = validateCheckout({
      ...baseInput,
      paymentLines: [
        { ...createPaymentLine(PaymentMethodEnum.TRANSFER, 100_000), paymentAccountId: account.id },
      ],
      paymentAccounts: [account],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe(CHECKOUT_ERROR_CODES.PAYMENT_ACCOUNT_NOT_LINKED);
    expect(result.message).toContain("Quỹ tiền > Tiền gửi");
  });

  it("allows a transfer line whose account is linked to a deposit fund", () => {
    const account = makeAccount("acc-linked", "bank_transfer", true);
    const result = validateCheckout({
      ...baseInput,
      paymentLines: [
        { ...createPaymentLine(PaymentMethodEnum.TRANSFER, 100_000), paymentAccountId: account.id },
      ],
      paymentAccounts: [account],
    });

    expect(result.ok).toBe(true);
  });

  it("never blocks a cash line, which has no deposit fund to link", () => {
    const account = makeAccount("acc-cash", "cash", false);
    const result = validateCheckout({
      ...baseInput,
      paymentLines: [
        { ...createPaymentLine(PaymentMethodEnum.CASH, 100_000), paymentAccountId: account.id },
      ],
      paymentAccounts: [account],
    });

    expect(result.ok).toBe(true);
  });
});
