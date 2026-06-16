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
  /** Legacy: số tiền KM thô; bị BE bỏ qua khi có `lineDiscountType`. */
  lineDiscount?: number;
  /** KM thủ công per-line: BE tự tính `lineDiscount` từ `lineDiscountValue`. */
  lineDiscountType?: "percent" | "amount";
  /** 10 = 10% khi type=percent; số tiền VNĐ khi type=amount. */
  lineDiscountValue?: number;
  /** Lý do/nhãn KM (≤ 255). */
  lineDiscountReason?: string;
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
  /**
   * Nhân viên bán hàng được chọn = employee profile id (`employee_profiles.id`,
   * lấy từ picker `GET /branches/:id/salesmen`). BE lưu vào
   * `invoices.salesperson_id` (FK → employee_profiles), tách khỏi `staffId` (người tạo đơn).
   */
  salespersonId?: string;
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
  /** Nhân viên bán hàng = employee profile id. Xem `CreateInvoiceBody`. */
  salespersonId?: string;
}

/**
 * Body cho `POST /invoices/:id/redeem-points` — áp dụng đổi điểm tích lũy vào
 * draft. BE validate (thẻ active, balance ≥ points, points × 1.000 ≤ giá trị
 * đơn còn lại); FE chỉ clamp `≥ 1` cho UX.
 */
export interface RedeemInvoicePointsBody {
  points: number;
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
 *
 * `dueDate` (ISO `YYYY-MM-DD`) + `creditDays` chỉ gửi khi tính vào công nợ; BE
 * lưu vào `invoice_debts` khi đơn còn dư nợ. Bỏ qua nếu đơn thanh toán đủ.
 */
export interface CheckoutInvoiceBody {
  payments: InvoicePaymentLineBody[];
  dueDate?: string;
  creditDays?: number;
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

// ─── v2 search (POST /v2/invoices/search) ─────────────────────────────────

export interface StringFilter { operator: "*" | "=" | "+" | "-" | "!"; value: string; }
export interface CompareFilter { operator: "=" | "<" | "<=" | ">" | ">="; value: string | number; }
export interface DateRangeFilter { from?: string; to?: string; }
export interface EnumFilter { value: string | null; }

export interface SearchInvoicesV2Body {
  page?:          number;
  limit?:         number;
  code?:          StringFilter;
  status?:        EnumFilter;
  type?:          EnumFilter;
  issuedAt?:      DateRangeFilter;
  createdAt?:     DateRangeFilter;
  customerId?:    string;
  customerCode?:  StringFilter;
  customerName?:  StringFilter;
  customerPhone?: StringFilter;
  amountDue?:     CompareFilter;
  note?:          StringFilter;
}

/** Body cho `POST /v2/invoices/returnable/search` — hóa đơn bán đã thanh toán (#5). */
export interface SearchReturnableInvoicesBody {
  page?:          number;
  limit?:         number;
  code?:          StringFilter;
  createdAt?:     DateRangeFilter;
  customerName?:  StringFilter;
  customerPhone?: StringFilter;
  totalPaid?:     CompareFilter;
  branchName?:    StringFilter;
}

/** Body cho `POST /v2/invoices/purchase-history/search` — lịch sử mua của 1 khách (#2). */
export interface SearchPurchaseHistoryBody {
  customerId:  string;
  page?:       number;
  limit?:      number;
  code?:       StringFilter;
  issuedAt?:   DateRangeFilter;
  storeName?:  StringFilter;
  status?:     EnumFilter;
  totalPaid?:  CompareFilter;
  note?:       StringFilter;
}

/** Body cho `POST /v2/invoices/drafts/search` — hóa đơn lưu tạm (#4). */
export interface SearchDraftInvoicesBody {
  page?:      number;
  limit?:     number;
  search?:    string;
  createdAt?: DateRangeFilter;
  sessionId?: string;
}

export interface InvoiceSearchV2Response {
  data:  import("@erp/pos/interfaces/invoice.interface").InvoiceRow[];
  total: number;
  page:  number;
  limit: number;
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
