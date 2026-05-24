import { PAYMENT_METHOD_TO_API_METHOD } from "@erp/pos/constants/checkout.constant";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import type {
  CheckoutInvoiceBody,
  CreateInvoiceBody,
  CreateInvoiceItemBody,
  InvoicePaymentLineBody,
  UpdateInvoiceBody,
} from "@erp/pos/dtos/invoice.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { ResolveCheckoutPayloadError } from "@erp/pos/types/checkout.type";
import type {
  CartLine,
  DraftInvoice,
} from "@erp/pos/interfaces/checkout.interface";

interface BuildCreateInvoicePayloadInput {
  sessionId: string;
  cart: CartLine[];
  customer: CustomerRow | null;
  note?: string;
  draftLabel?: string;
}

/**
 * Build payload cho `POST /invoices`. Mapping CartLine → CreateInvoiceItemBody:
 *   - sortOrder = index (giữ thứ tự cart hiện hữu).
 *   - lineDiscount = 0 (chiết khấu dòng chưa wire vào UI).
 */
function mapCartToInvoiceItems(cart: CartLine[]): CreateInvoiceItemBody[] {
  return cart.map((line, index) => ({
    itemId: line.itemId,
    locationId: line.locationId || undefined,
    itemCode: line.code,
    itemName: line.name,
    unit: line.unit,
    quantity: line.qty,
    unitPrice: line.unitPrice,
    lineDiscount: 0,
    sortOrder: index,
  }));
}

export function buildCreateInvoicePayload(
  input: BuildCreateInvoicePayloadInput,
): CreateInvoiceBody {
  return {
    sessionId: input.sessionId,
    customerId: input.customer?.id,
    draftLabel: input.draftLabel,
    note: input.note,
    items: mapCartToInvoiceItems(input.cart),
  };
}

interface BuildUpdateInvoicePayloadInput {
  cart: CartLine[];
  customer: CustomerRow | null;
  note?: string;
  draftLabel?: string;
}

/**
 * Build payload cho `PATCH /invoices/:id`. Dùng khi lưu/thanh toán lại một draft
 * đã restore — `items` thay thế toàn bộ danh sách item hiện tại của draft.
 */
export function buildUpdateInvoicePayload(
  input: BuildUpdateInvoicePayloadInput,
): UpdateInvoiceBody {
  return {
    customerId: input.customer?.id,
    draftLabel: input.draftLabel,
    note: input.note,
    items: mapCartToInvoiceItems(input.cart),
  };
}

interface BuildCheckoutInvoiceApiPayloadInput {
  paymentLines: PaymentLine[];
  debt: boolean;
}

/**
 * Build payload cho `POST /invoices/:id/checkout`. Trả về `{ ok: true, body }`
 * khi mọi dòng thanh toán đã chọn tài khoản; nếu không, `{ ok: false, error }`
 * để caller toast và abort. Quy tắc nghiệp vụ:
 *   - `debt === true` ⇒ payments=[] (nợ toàn phần). BE tự dựng bút toán phải thu.
 *   - Ngược lại: map từng PaymentLine có amount > 0, gửi `paymentAccountId` của
 *     tài khoản nhận tiền. BE tự suy ra COA account + tài khoản doanh thu / công
 *     nợ phải thu, nên FE không gửi revenue/receivable account nữa.
 */
export function buildCheckoutInvoiceApiPayload(
  input: BuildCheckoutInvoiceApiPayloadInput,
):
  | { ok: true; body: CheckoutInvoiceBody }
  | { ok: false; error: ResolveCheckoutPayloadError } {
  if (input.debt) {
    return { ok: true, body: { payments: [] } };
  }

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

  return { ok: true, body: { payments } };
}

/**
 * Map `InvoiceRow` từ API (`/invoices/drafts` hoặc `/invoices/:id`) sang shape
 * `DraftInvoice` mà dialog + restore-tab flow đang dùng. Không trả về customer
 * name/phone vì endpoint drafts không kèm — cần fetch riêng nếu hiển thị đầy đủ.
 *
 * Các cột `numeric` (quantity, unitPrice, amountDue) được API trả về dạng
 * **string** (Postgres numeric → string), nên phải `Number(...)` về số — nếu
 * không `qty` là string sẽ làm `bumpQty` nối chuỗi và `<input type="number">`
 * hiển thị trống.
 */
export function mapInvoiceRowToDraftInvoice(
  row: InvoiceRow,
  customer?: CustomerRow | null,
): DraftInvoice {
  const lines: CartLine[] = (row.items ?? []).map((item) => ({
    lineId: item.id,
    itemId: item.itemId,
    name: item.itemName,
    code: item.itemCode,
    unit: item.unit,
    unitPrice: Number(item.unitPrice) || 0,
    qty: Number(item.quantity) || 0,
    locationId: item.locationId ?? "",
    maxQty: Number.MAX_SAFE_INTEGER,
  }));

  return {
    id: row.id,
    invoiceNumber: row.code,
    customerId: row.customerId ?? null,
    customerName: customer ? formatCustomerDisplay(customer) : null,
    customerPhone: customer?.phone ?? null,
    createdAt: new Date(row.createdAt),
    lines,
    total: Number(row.amountDue) || 0,
  };
}
