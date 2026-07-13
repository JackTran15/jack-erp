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

/** CartLine (dòng trả) → ReturnInvoiceLineBody. `lineDiscount` chưa wire ⇒ 0. */
function mapReturnLine(line: CartLine): ReturnInvoiceLineBody {
  return {
    originalInvoiceItemId: line.originalInvoiceItemId,
    itemId: line.itemId,
    itemCode: line.code,
    itemName: line.name,
    unit: line.unit,
    locationId: line.locationId,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineDiscount: 0,
  };
}

/** CartLine (hàng mua mới của đơn đổi) → CreateInvoiceItemBody (giống SALE). */
function mapNewLine(line: CartLine, index: number): CreateInvoiceItemBody {
  return {
    itemId: line.itemId,
    locationId: line.locationId || undefined,
    itemCode: line.code,
    itemName: line.name,
    unit: line.unit,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineDiscount: 0,
    sortOrder: index,
  };
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
  originalInvoiceId: string;
  customer: CustomerRow | null;
  reason: string;
  returnLines: CartLine[];
  newLines: CartLine[];
}

/** Body cho `POST /invoices/exchanges` (trả + mua mới, bắt buộc hóa đơn gốc). */
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
  revenueAccountId: string;
  /** Tổng tiền hàng trả lại (Σ unitPrice × qty của return lines). */
  returnSubtotal: number;
  /** Tổng tiền hàng mua mới (Σ unitPrice × qty của new lines, 0 nếu trả thuần). */
  newSubtotal: number;
  paymentLines: PaymentLine[];
  /**
   * Operator tích "Tính vào công nợ" (chỉ ở luồng hoàn tiền, net<0) → bù trừ
   * khoản hoàn vào công nợ hóa đơn gốc (OFFSET). Mặc định false ⇒ chi tiền mặt.
   */
  offsetToDebt?: boolean;
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
 *   - net < 0  → hoàn tiền khách: OFFSET nếu operator tích "Tính vào công nợ",
 *     ngược lại CASH (mặc định, không kèm payments). BE tự chuyển OFFSET→CASH
 *     nếu hóa đơn gốc không còn công nợ để bù trừ.
 * `revenueAccountId` luôn bắt buộc; `cashAccountId` để trống ⇒ BE lấy theo ca quỹ.
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
        revenueAccountId: input.revenueAccountId,
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

  return {
    ok: true,
    body: {
      refundMethod:
        net === 0 ? "OFFSET" : input.offsetToDebt ? "OFFSET" : "CASH",
      revenueAccountId: input.revenueAccountId,
      note: input.note,
    },
  };
}
