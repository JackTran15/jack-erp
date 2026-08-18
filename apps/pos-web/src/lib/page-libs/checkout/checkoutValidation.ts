import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type { PaymentAccountRow } from "@erp/pos/interfaces/account.interface";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";

export const CHECKOUT_ERROR_CODES = {
  EMPTY_CART: "EMPTY_CART",
  DEBT_REQUIRES_CUSTOMER: "DEBT_REQUIRES_CUSTOMER",
  RETURN_QTY_EXCEEDS_ORIGIN: "RETURN_QTY_EXCEEDS_ORIGIN",
  UNDERPAID_SALE: "UNDERPAID_SALE",
  UNDERPAID_RETURN: "UNDERPAID_RETURN",
  OVERPAID_RETURN: "OVERPAID_RETURN",
  PAYMENT_ACCOUNT_NOT_LINKED: "PAYMENT_ACCOUNT_NOT_LINKED",
} as const;

export type CheckoutErrorCode =
  (typeof CHECKOUT_ERROR_CODES)[keyof typeof CHECKOUT_ERROR_CODES];

export type CheckoutValidationResult =
  | { ok: true }
  | { ok: false; code: CheckoutErrorCode; message: string };

export interface CheckoutValidationInput {
  hasAnyCartLines: boolean;
  debt: boolean;
  keepChange: boolean;
  selectedCustomer: CustomerRow | null;
  purchaseCart: ReadonlyArray<CartLine>;
  settlementGrandTotal: number;
  settlementAbs: number;
  totalPaid: number;
  changeAmount: number;
  shortageAmount: number;
  paymentLines: ReadonlyArray<PaymentLine>;
  paymentAccounts: ReadonlyArray<PaymentAccountRow>;
}

export function validateCheckout(
  input: CheckoutValidationInput,
): CheckoutValidationResult {
  const {
    hasAnyCartLines,
    debt,
    keepChange,
    selectedCustomer,
    purchaseCart,
    settlementGrandTotal,
    settlementAbs,
    totalPaid,
    changeAmount,
    shortageAmount,
    paymentLines,
    paymentAccounts,
  } = input;

  if (!hasAnyCartLines) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.EMPTY_CART,
      message: "Giỏ hàng trống.",
    };
  }

  if (debt && !selectedCustomer) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.DEBT_REQUIRES_CUSTOMER,
      message: "Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.",
    };
  }

  if (purchaseCart.some((l) => l.isReturnCredit && l.qty > l.maxQty)) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.RETURN_QTY_EXCEEDS_ORIGIN,
      message:
        "Số lượng hoàn trả vượt quá số lượng được phép trên hóa đơn gốc. Vui lòng kiểm tra lại.",
    };
  }

  // Chuyển khoản/thẻ phải trỏ vào một quỹ tiền gửi, nếu không khoản thu sẽ không lên
  // được "Quỹ tiền > Tiền gửi" ở Backoffice — và nó biến mất trong im lặng chứ không
  // báo lỗi. BE cũng chặn ca này (AccountResolverService.resolvePaymentAccount); chặn
  // ở đây để thu ngân biết ngay tại quầy thay vì ăn lỗi 400 sau khi đã nhập xong.
  // Chỉ xét dòng đã chọn được tài khoản: dòng chưa chọn do precheck payload lo, và
  // thông báo "chưa liên kết" sẽ sai với ca "chưa chọn".
  const unlinkedLine = paymentLines.find((line) => {
    if (line.method === PaymentMethodEnum.CASH || line.amount <= 0) return false;
    const account = paymentAccounts.find((a) => a.id === line.paymentAccountId);
    return Boolean(account) && !account!.depositLinked;
  });
  if (unlinkedLine) {
    const methodLabel =
      PAYMENT_METHODS.find((m) => m.value === unlinkedLine.method)?.label ??
      String(unlinkedLine.method);
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.PAYMENT_ACCOUNT_NOT_LINKED,
      message: `Phương thức "${methodLabel}" chưa liên kết tài khoản ngân hàng. Vui lòng cấu hình tại Quỹ tiền > Tiền gửi trước khi thanh toán.`,
    };
  }

  const saleNetReturnToCustomer = changeAmount - shortageAmount;
  const debtCovered = debt && Boolean(selectedCustomer);

  if (
    settlementGrandTotal > 0 &&
    saleNetReturnToCustomer < 0 &&
    !keepChange &&
    !debtCovered
  ) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.UNDERPAID_SALE,
      message: "Bạn chưa nhập đủ số tiền cần thanh toán. Vui lòng kiểm tra lại!",
    };
  }

  if (
    settlementGrandTotal < 0 &&
    totalPaid < settlementAbs &&
    !keepChange &&
    !debtCovered
  ) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.UNDERPAID_RETURN,
      message: "Bạn chưa nhập đủ số tiền cần trả khách. Vui lòng kiểm tra lại!",
    };
  }

  if (settlementGrandTotal < 0 && totalPaid > settlementAbs) {
    return {
      ok: false,
      code: CHECKOUT_ERROR_CODES.OVERPAID_RETURN,
      message:
        "Số tiền nhập trong hình thức đổi trả đang vượt quá số tiền cần trả lại khách. Vui lòng kiểm tra lại!",
    };
  }

  return { ok: true };
}
