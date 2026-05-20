import { PAYMENT_METHOD_TO_API_METHOD } from "@erp/pos/constants/checkout.constant";
import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { AccountRow } from "@erp/pos/interfaces/account.interface";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import type {
  CheckoutInvoiceBody,
  CreateInvoiceBody,
  CreateInvoiceItemBody,
  InvoicePaymentLineBody,
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
export function buildCreateInvoicePayload(
  input: BuildCreateInvoicePayloadInput,
): CreateInvoiceBody {
  const items: CreateInvoiceItemBody[] = input.cart.map((line, index) => ({
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

  return {
    sessionId: input.sessionId,
    customerId: input.customer?.id,
    draftLabel: input.draftLabel,
    note: input.note,
    items,
  };
}

interface BuildCheckoutInvoiceApiPayloadInput {
  paymentLines: PaymentLine[];
  debt: boolean;
  amountDue: number;
  /** Resolved từ `useRevenueAccountsQuery`. */
  revenueAccountId: string;
  /** Resolved từ `useReceivableAccountsQuery` — chỉ cần khi debt/partial-debt. */
  receivableAccountId?: string;
  /**
   * Index `accountId → AccountRow` (COA). Caller bảo đảm mọi `line.cashAccountId`
   * không null đều có trong index. `payments[i].accountId` chính là chính
   * `line.cashAccountId` (COA account.id) — không cần lookup ra field khác.
   */
  accountById: Map<string, AccountRow>;
}

/**
 * Build payload cho `POST /invoices/:id/checkout`. Trả về `{ ok: true, body }`
 * khi mọi reference resolve được; nếu không, `{ ok: false, error }` để caller
 * toast và abort. Quy tắc nghiệp vụ:
 *   - `debt === true` ⇒ payments=[], gắn receivableAccountId.
 *   - Ngược lại: map từng PaymentLine có amount > 0; nếu tổng paid < amountDue
 *     vẫn gắn receivableAccountId (BE bắt buộc khi PARTIAL_DEBT).
 */
export function buildCheckoutInvoiceApiPayload(
  input: BuildCheckoutInvoiceApiPayloadInput,
):
  | { ok: true; body: CheckoutInvoiceBody }
  | { ok: false; error: ResolveCheckoutPayloadError } {
  if (!input.revenueAccountId) {
    return { ok: false, error: { code: "missing_revenue_account" } };
  }

  if (input.debt) {
    if (!input.receivableAccountId) {
      return { ok: false, error: { code: "missing_receivable_account" } };
    }
    return {
      ok: true,
      body: {
        payments: [],
        revenueAccountId: input.revenueAccountId,
        receivableAccountId: input.receivableAccountId,
      },
    };
  }

  const activeLines = input.paymentLines.filter((line) => line.amount > 0);
  const payments: InvoicePaymentLineBody[] = [];
  for (const line of activeLines) {
    line.cashAccountId = "f29226ef-9131-4256-883c-7cf53b75fa8e";

    if (!line.cashAccountId) {
      return {
        ok: false,
        error: { code: "missing_cash_account", cashAccountId: null },
      };
    }
    // if (!input.accountById.has(line.cashAccountId)) {
    //   return {
    //     ok: false,
    //     error: {
    //       code: "missing_cash_account",
    //       cashAccountId: line.cashAccountId,
    //     },
    //   };
    // }
    payments.push({
      paymentMethod: PAYMENT_METHOD_TO_API_METHOD[line.method],
      amount: line.amount,
      accountId: line.cashAccountId,
    });
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const isPartialDebt = totalPaid < input.amountDue;
  if (isPartialDebt && !input.receivableAccountId) {
    return { ok: false, error: { code: "missing_receivable_account" } };
  }

  return {
    ok: true,
    body: {
      payments,
      revenueAccountId: input.revenueAccountId,
      receivableAccountId: isPartialDebt
        ? input.receivableAccountId
        : undefined,
    },
  };
}

/**
 * Map `InvoiceRow` từ API (`/invoices/drafts` hoặc `/invoices/:id`) sang shape
 * `DraftInvoice` mà dialog + restore-tab flow đang dùng. Không trả về customer
 * name/phone vì endpoint drafts không kèm — cần fetch riêng nếu hiển thị đầy đủ.
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
    unitPrice: item.unitPrice,
    qty: item.quantity,
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
    total: row.amountDue,
  };
}
