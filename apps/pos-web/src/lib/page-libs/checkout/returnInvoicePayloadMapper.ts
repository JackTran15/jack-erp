import { PAYMENT_METHOD_TO_API_METHOD } from "@erp/pos/constants/checkout.constant";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { CartLine } from "@erp/pos/interfaces/checkout.interface";
import type {
  CheckoutReturnBody,
  CreateExchangeInvoiceBody,
  CreateInvoiceItemBody,
  CreateReturnInvoiceBody,
  InvoicePaymentLineBody,
  ReturnInvoiceLineBody,
} from "@erp/pos/dtos/invoice.dto";
import type { ReturnInvoiceMode } from "@erp/pos/types/invoice.type";
import type { ResolveCheckoutPayloadError } from "@erp/pos/types/checkout.type";

/**
 * CartLine (dòng trả) → ReturnInvoiceLineBody.
 *
 * KM dòng gửi lên dưới dạng **ý định** (`type` + `value` + `reason`) chứ không
 * phải số tiền đã tính: BE tự suy ra `lineDiscount` và `lineTotal`. Trước đây
 * chỗ này gửi cứng `lineDiscount: 0`, nên một dòng KM 30% xuống tới chứng từ là
 * giá gộp — đơn đổi hiện 19.500 trên màn hình lại thành 225.000 phần chênh.
 */
function mapReturnLine(line: CartLine): ReturnInvoiceLineBody {
  const body: ReturnInvoiceLineBody = {
    originalInvoiceItemId: line.originalInvoiceItemId,
    itemId: line.itemId,
    itemCode: line.code,
    itemName: line.name,
    unit: line.unit,
    locationId: line.locationId,
    quantity: line.qty,
    unitPrice: line.unitPrice,
  };
  if (line.lineDiscount) {
    body.lineDiscountType = line.lineDiscount.type;
    body.lineDiscountValue = line.lineDiscount.value;
    body.lineDiscountReason = line.lineDiscount.reason;
  }
  return body;
}

/** CartLine (hàng mua mới của đơn đổi) → CreateInvoiceItemBody (giống SALE). */
function mapNewLine(line: CartLine, index: number): CreateInvoiceItemBody {
  const body: CreateInvoiceItemBody = {
    itemId: line.itemId,
    locationId: line.locationId || undefined,
    itemCode: line.code,
    itemName: line.name,
    unit: line.unit,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    sortOrder: index,
  };
  if (line.lineDiscount) {
    body.lineDiscountType = line.lineDiscount.type;
    body.lineDiscountValue = line.lineDiscount.value;
    body.lineDiscountReason = line.lineDiscount.reason;
  }
  return body;
}

interface BuildCreateReturnPayloadInput {
  mode: ReturnInvoiceMode;
  sessionId: string;
  originalInvoiceId?: string;
  customer: CustomerRow | null;
  reason: string;
  returnLines: CartLine[];
}

/** Body cho `POST /invoices/returns`. `originalInvoiceId` chỉ gắn ở mode regular. */
export function buildCreateReturnPayload(
  input: BuildCreateReturnPayloadInput,
): CreateReturnInvoiceBody {
  return {
    mode: input.mode,
    originalInvoiceId:
      input.mode === "regular" ? input.originalInvoiceId : undefined,
    customerId: input.customer?.id,
    sessionId: input.sessionId,
    reason: input.reason,
    lines: input.returnLines.map(mapReturnLine),
  };
}

interface BuildCreateExchangePayloadInput {
  sessionId: string;
  /** Bỏ trống ở luồng đổi trả nhanh — BE suy ra chế độ quick từ chỗ thiếu này. */
  originalInvoiceId?: string;
  customer: CustomerRow | null;
  reason: string;
  returnLines: CartLine[];
  newLines: CartLine[];
}

/**
 * Body cho `POST /invoices/exchanges` (trả + mua mới). `originalInvoiceId` chỉ
 * có ở luồng đổi trả theo hóa đơn; luồng nhanh bỏ trống, và vì `undefined` bị
 * `JSON.stringify` loại khỏi body nên BE nhận đúng "không có field" chứ không
 * phải `null`.
 */
export function buildCreateExchangePayload(
  input: BuildCreateExchangePayloadInput,
): CreateExchangeInvoiceBody {
  return {
    sessionId: input.sessionId,
    originalInvoiceId: input.originalInvoiceId,
    reason: input.reason,
    customerId: input.customer?.id,
    returnLines: input.returnLines.map(mapReturnLine),
    newLines: input.newLines.map(mapNewLine),
  };
}

interface BuildCheckoutReturnPayloadInput {
  /** Tổng tiền hàng trả lại (Σ unitPrice × qty của return lines). */
  returnSubtotal: number;
  /** Tổng tiền hàng mua mới (Σ unitPrice × qty của new lines, 0 nếu trả thuần). */
  newSubtotal: number;
  paymentLines: PaymentLine[];
  /**
   * Đơn ĐỔI net>0 (khách nợ thêm): operator tích "Tính vào công nợ" → phần chênh
   * chưa thu (net − Σpayments) ghi vào công nợ khách. `dueDate`/`creditDays` là hạn
   * nợ (BE tự resolve tài khoản phải thu). Mặc định false ⇒ ép thu đủ tiền mặt.
   */
  putOnDebt?: boolean;
  dueDate?: string | null;
  creditDays?: number | null;
  note?: string;
}

/**
 * Body cho `POST /invoices/:id/checkout-return`. Chọn `refundMethod` theo
 * `netAmount = newSubtotal − returnSubtotal` (đúng ma trận BE):
 *   - net > 0  → khách trả thêm: CASH + `payments` (map từ dòng thanh toán).
 *   - net = 0  → bù trừ ngang: OFFSET.
 *   - net < 0  → hoàn tiền khách theo quỹ operator chọn ở "Hình thức đổi trả":
 *     tiền mặt ⇒ CASH, tài khoản ngân hàng/thẻ ⇒ BANK + `refundAccountId`
 *     (payment_accounts.id).
 *
 * `refundMethod` KHÔNG quyết định việc cấn trừ công nợ: BE luôn trừ dư nợ hóa
 * đơn gốc trước rồi mới chi phần còn lại qua quỹ này, và trả về `offsetAmount`.
 * Vì vậy FE không còn gửi `OFFSET` ở luồng hoàn tiền.
 *
 * BE tự resolve tài khoản doanh thu (contra) — FE không gửi `revenueAccountId`;
 * `cashAccountId` để trống ⇒ BE lấy theo quỹ chi nhánh.
 */
export function buildCheckoutReturnPayload(
  input: BuildCheckoutReturnPayloadInput,
):
  | { ok: true; body: CheckoutReturnBody }
  | { ok: false; error: ResolveCheckoutPayloadError } {
  const net = input.newSubtotal - input.returnSubtotal;

  if (net > 0) {
    const activeLines = input.paymentLines.filter((line) => line.amount > 0);
    const payments: InvoicePaymentLineBody[] = [];
    for (const line of activeLines) {
      if (!line.paymentAccountId) {
        return { ok: false, error: { code: "missing_payment_account" } };
      }
      payments.push({
        paymentMethod: PAYMENT_METHOD_TO_API_METHOD[line.method],
        amount: line.amount,
        paymentAccountId: line.paymentAccountId,
      });
    }
    // Tích "Tính vào công nợ" ⇒ chỉ gửi phần đã thu (có thể rỗng), BE ghi phần
    // chênh còn lại vào công nợ khách kèm hạn nợ. Không tích ⇒ BE ép thu đủ.
    return {
      ok: true,
      body: {
        refundMethod: "CASH",
        payments,
        ...(input.putOnDebt
          ? {
              dueDate: input.dueDate ?? undefined,
              creditDays: input.creditDays ?? undefined,
            }
          : {}),
        note: input.note,
      },
    };
  }

  // net === 0: bù trừ ngang (không có tiền đổi chủ) ⇒ OFFSET.
  if (net === 0) {
    return {
      ok: true,
      body: {
        refundMethod: "OFFSET",
        note: input.note,
      },
    };
  }

  // net < 0: hoàn tiền theo quỹ operator chọn ở "Hình thức đổi trả". Dòng hoàn
  // (amount = TOÀN BỘ khoản hoàn) mang method + tài khoản đã chọn: tiền mặt ⇒
  // CASH, ngân hàng/thẻ ⇒ BANK + payment_accounts.id để BE trừ đúng quỹ tiền gửi.
  // BE chỉ chi ra phần còn lại sau khi đã cấn trừ công nợ hóa đơn gốc.
  const selected =
    input.paymentLines.find((line) => line.amount > 0) ??
    input.paymentLines[0];
  const apiMethod = selected
    ? PAYMENT_METHOD_TO_API_METHOD[selected.method]
    : "cash";

  if (apiMethod === "cash") {
    return {
      ok: true,
      body: {
        refundMethod: "CASH",
        note: input.note,
      },
    };
  }

  if (!selected?.paymentAccountId) {
    return { ok: false, error: { code: "missing_payment_account" } };
  }
  return {
    ok: true,
    body: {
      refundMethod: "BANK",
      refundAccountId: selected.paymentAccountId,
      note: input.note,
    },
  };
}
