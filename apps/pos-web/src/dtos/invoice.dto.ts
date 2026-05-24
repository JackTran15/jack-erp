import type { ApiPaymentMethod, InvoiceStatus } from "@erp/pos/types/invoice.type";

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
