import type {
  ApiPaymentMethod,
  InvoiceStatus,
  RefundMethod,
  ReturnInvoiceMode,
} from "@erp/pos/types/invoice.type";

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

/**
 * Body cho `PATCH /invoices/:id` — cập nhật draft (chỉ khi `isDraft=true`).
 * Gửi `items` sẽ **thay thế hoàn toàn** danh sách item hiện tại.
 */
export interface UpdateInvoiceBody {
  customerId?: string;
  draftLabel?: string;
  note?: string;
  items?: CreateInvoiceItemBody[];
}

export interface InvoicePaymentLineBody {
  paymentMethod: ApiPaymentMethod;
  amount: number;
  /** id của tài khoản nhận tiền đã cấu hình (payment_accounts.id). */
  paymentAccountId: string;
  reference?: string;
}

/**
 * Body cho `POST /invoices/:id/checkout` — chuyển draft → paid/debt/partial_debt.
 * `payments: []` đồng nghĩa "nợ toàn phần" (cần khách hàng trên hóa đơn). BE tự
 * resolve tài khoản doanh thu / công nợ phải thu từ cấu hình, FE không gửi.
 */
export interface CheckoutInvoiceBody {
  payments: InvoicePaymentLineBody[];
}

// ─── Return / Exchange (EPIC-011) ──────────────────────────────────────────
// Đơn trả/đổi dùng endpoint riêng (không phải `type` trên POST /invoices):
//   POST /invoices/returns      — tạo draft RETURN (mode quick|regular)
//   POST /invoices/exchanges    — tạo draft EXCHANGE (bắt buộc có hóa đơn gốc)
//   POST /invoices/:id/checkout-return — tất toán + hoàn tiền/ghi có

/**
 * Một dòng hàng trả lại. Mirror `ReturnInvoiceLineDto`
 * (`apps/api/src/modules/pos/dto/create-return-invoice.dto.ts`).
 * `originalInvoiceItemId` bắt buộc ở mode `regular` (trỏ về invoice_item gốc).
 */
export interface ReturnInvoiceLineBody {
  originalInvoiceItemId?: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  locationId: string;
  quantity: number;
  unitPrice: number;
  lineDiscount?: number;
  note?: string;
}

/** Body cho `POST /invoices/returns` — tạo draft RETURN. */
export interface CreateReturnInvoiceBody {
  mode: ReturnInvoiceMode;
  /** Bắt buộc khi `mode = "regular"`. */
  originalInvoiceId?: string;
  customerId?: string;
  sessionId: string;
  reason: string;
  lines: ReturnInvoiceLineBody[];
}

/** Body cho `POST /invoices/exchanges` — tạo draft EXCHANGE (trả + mua mới). */
export interface CreateExchangeInvoiceBody {
  sessionId: string;
  originalInvoiceId: string;
  reason: string;
  customerId?: string;
  /** Hàng trả lại (direction=IN), trỏ về dòng hóa đơn bán gốc. */
  returnLines: ReturnInvoiceLineBody[];
  /** Hàng mua mới (direction=OUT) — cùng shape dòng hàng SALE thường. */
  newLines: CreateInvoiceItemBody[];
}

/**
 * Body cho `POST /invoices/:id/checkout-return` — tất toán đơn trả/đổi.
 * `revenueAccountId` bắt buộc (BE chưa tự resolve cho luồng trả). `payments` chỉ
 * cần khi EXCHANGE có netAmount > 0. `cashAccountId` để trống → BE lấy theo ca
 * quỹ đang mở.
 */
export interface CheckoutReturnBody {
  refundMethod: RefundMethod;
  revenueAccountId: string;
  cashAccountId?: string;
  receivableAccountId?: string;
  creditLiabilityAccountId?: string;
  creditExpiresAt?: string;
  payments?: InvoicePaymentLineBody[];
  note?: string;
}

/** Query params cho `GET /invoices` — danh sách invoice có filter + phân trang. */
export interface ListInvoicesParams {
  customerId?: string;
  status?: InvoiceStatus;
  isDraft?: boolean;
  branchId?: string;
  /** ISO date — `issued_at ≥`. */
  dateFrom?: string;
  /** ISO date — `issued_at ≤`. */
  dateTo?: string;
  page?: number;
  limit?: number;
}
