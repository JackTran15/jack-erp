import { PAYMENT_METHOD_TO_API_METHOD } from "@erp/pos/constants/checkout.constant";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import { clampPosCheckoutQtyNumber } from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
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
  Salesperson,
} from "@erp/pos/interfaces/checkout.interface";

interface BuildCreateInvoicePayloadInput {
  sessionId: string;
  cart: CartLine[];
  customer: CustomerRow | null;
  note?: string;
  draftLabel?: string;
  salesperson?: Salesperson | null;
}

/**
 * Build payload cho `POST /invoices`. Mapping CartLine → CreateInvoiceItemBody:
 *   - sortOrder = index (giữ thứ tự cart hiện hữu).
 *   - note + KM dòng (`lineDiscount` {type,value,reason}) gửi lên để BE tự tính
 *     `lineDiscount` amount + `lineTotal`. Chỉ gắn field khi dòng thực sự có.
 */
function mapCartToInvoiceItems(cart: CartLine[]): CreateInvoiceItemBody[] {
  return cart.map((line, index) => {
    const item: CreateInvoiceItemBody = {
      itemId: line.itemId,
      locationId: line.locationId || undefined,
      itemCode: line.code,
      itemName: line.name,
      unit: line.unit,
      quantity: line.qty,
      unitPrice: line.unitPrice,
      sortOrder: index,
    };
    if (line.note) item.note = line.note;
    if (line.lineDiscount) {
      item.lineDiscountType = line.lineDiscount.type;
      item.lineDiscountValue = line.lineDiscount.value;
      item.lineDiscountReason = line.lineDiscount.reason;
    }
    return item;
  });
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
    salespersonId: input.salesperson?.id,
  };
}

interface BuildUpdateInvoicePayloadInput {
  cart: CartLine[];
  customer: CustomerRow | null;
  note?: string;
  draftLabel?: string;
  salesperson?: Salesperson | null;
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
    salespersonId: input.salesperson?.id,
  };
}

interface BuildCheckoutInvoiceApiPayloadInput {
  paymentLines: PaymentLine[];
  /** Hạn thanh toán công nợ (ISO `YYYY-MM-DD`) — chỉ truyền khi tính vào công nợ. */
  dueDate?: string | null;
  /** Số ngày được nợ — chỉ truyền khi tính vào công nợ. */
  creditDays?: number | null;
}

/**
 * Build payload cho `POST /invoices/:id/checkout`. Trả về `{ ok: true, body }`
 * khi mọi dòng thanh toán đã chọn tài khoản; nếu không, `{ ok: false, error }`
 * để caller toast và abort. Quy tắc nghiệp vụ:
 *   - Map từng PaymentLine có amount > 0, gửi `paymentAccountId` của tài khoản
 *     nhận tiền. BE tự suy ra COA account + tài khoản doanh thu / công nợ phải thu.
 *   - Khi "Tính vào công nợ": gửi đúng phần khách trả; phần còn lại (payments
 *     rỗng = nợ toàn phần, hoặc ∑ < amountDue = nợ một phần) được BE auto-book
 *     vào `invoice_debts` (`PARTIAL_DEBT`/`DEBT`). FE không cần cờ debt ở đây.
 */
export function buildCheckoutInvoiceApiPayload(
  input: BuildCheckoutInvoiceApiPayloadInput,
):
  | { ok: true; body: CheckoutInvoiceBody }
  | { ok: false; error: ResolveCheckoutPayloadError } {
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

  const body: CheckoutInvoiceBody = { payments };
  if (input.dueDate) body.dueDate = input.dueDate;
  if (input.creditDays != null) body.creditDays = input.creditDays;

  return { ok: true, body };
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
  const lines: CartLine[] = (row.items ?? []).map((item) => {
    const line: CartLine = {
      lineId: item.id,
      itemId: item.itemId,
      name: item.itemName,
      code: item.itemCode,
      unit: item.unit,
      unitPrice: Number(item.unitPrice) || 0,
      // Đây là đường DUY NHẤT dựng `CartLine` không đi qua ô nhập SL, nên phải
      // tự kẹp: dòng nháp lỗi/legacy từng sinh ra `qty: 0` mà không validation
      // nào bắt được trước lúc submit.
      qty: clampPosCheckoutQtyNumber(Number(item.quantity) || 0),
      locationId: item.locationId ?? "",
      // Hóa đơn nháp không kèm tồn kho. KHÔNG dùng sentinel vô hạn ở đây —
      // `qty > maxQty` sẽ vĩnh viễn false và tắt sạch cảnh báo bán vượt tồn.
      // Đánh dấu chưa-biết-tồn để `syncPurchaseCartOnHand` điền số thật, và để
      // cảnh báo vẫn bật trong lúc chờ sync.
      maxQty: 0,
      onHandUnknown: true,
    };
    if (item.note) line.note = item.note;
    // Chỉ KM thủ công (có type+value+reason) mới dựng lại được CartLineDiscount;
    // dòng legacy chỉ có `lineDiscount` amount thì bỏ qua.
    if (item.lineDiscountType && item.lineDiscountValue != null) {
      line.lineDiscount = {
        type: item.lineDiscountType,
        value: Number(item.lineDiscountValue) || 0,
        reason: item.lineDiscountReason ?? "",
      };
    }
    return line;
  });

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
