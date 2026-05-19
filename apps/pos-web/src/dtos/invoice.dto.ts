/**
 * Một item trên payload tạo invoice. Mirror `CreateInvoiceItemDto` ở backend
 * (`apps/api/src/modules/pos/dto/create-invoice.dto.ts`).
 */
export interface CreateInvoiceItemBody {
  itemId: string;
  locationId?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineDiscount?: number;
  note?: string;
  sortOrder?: number;
}

/** Body cho `POST /invoices` — tạo invoice ở trạng thái DRAFT. */
export interface CreateInvoiceBody {
  sessionId: string;
  customerId?: string;
  draftLabel?: string;
  note?: string;
  items?: CreateInvoiceItemBody[];
}

/** Phương thức thanh toán API hỗ trợ — khác với UI enum (TRANSFER ↔ bank_transfer). */
export type ApiPaymentMethod = "cash" | "bank_transfer" | "card";

export interface InvoicePaymentLineBody {
  paymentMethod: ApiPaymentMethod;
  amount: number;
  accountId: string;
  reference?: string;
}

/**
 * Body cho `POST /invoices/:id/checkout` — chuyển draft → paid/debt/partial_debt.
 * `payments: []` đồng nghĩa "nợ toàn phần" và bắt buộc kèm `receivableAccountId`.
 */
export interface CheckoutInvoiceBody {
  payments: InvoicePaymentLineBody[];
  revenueAccountId: string;
  receivableAccountId?: string;
}

export type InvoiceStatus =
  | "draft"
  | "pending"
  | "paid"
  | "debt"
  | "partial_debt"
  | "cancelled";

export interface InvoiceItemRow {
  id: string;
  itemId: string;
  locationId?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  note?: string;
  sortOrder?: number;
}

/**
 * Bản ghi invoice trả về từ `POST /invoices`, `GET /invoices/:id`, `GET /invoices/drafts`
 * và `POST /invoices/:id/checkout`. `items` chỉ có ở endpoint chi tiết.
 */
export interface InvoiceRow {
  id: string;
  code: string;
  status: InvoiceStatus;
  isDraft: boolean;
  draftLabel?: string;
  sessionId: string;
  customerId?: string;
  staffId: string;
  subtotal: number;
  discountAmount: number;
  depositAmount: number;
  amountDue: number;
  totalPaid: number;
  note?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt?: string;
  items?: InvoiceItemRow[];
}
