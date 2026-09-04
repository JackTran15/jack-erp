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
/**
 * Ảnh chụp dòng thanh toán tại thời điểm "Lưu tạm" (`invoices.draft_payments`).
 * KHÁC `InvoicePaymentLineBody`: cái kia là tiền đã thu thật lúc thanh toán và
 * chảy vào sổ kế toán; cái này chỉ là số thu ngân đang gõ dở trên một phiếu chưa
 * bán, để mở lại tab thì thấy đúng số cũ.
 */
export interface DraftPaymentBody {
  method: ApiPaymentMethod;
  amount: number;
  paymentAccountId?: string;
}

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
  /** Dòng thanh toán đang gõ dở, để mở lại phiếu lưu tạm không phải nhập lại tiền. */
  payments?: DraftPaymentBody[];
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
  /**
   * Bỏ trống = giữ nguyên snapshot đang có trên draft; mảng rỗng = xoá. Đừng gửi
   * `undefined` khi thật sự muốn xoá.
   */
  payments?: DraftPaymentBody[];
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
  /** Tiền thừa khách không lấy — BE ghi phiếu thu "thu nhập khác", ngoài `payments`. */
  keptChangeAmount?: number;
  dueDate?: string;
  creditDays?: number;
  /**
   * Id các CTKM tùy chọn thu ngân đã chọn (luồng SALE, `VITE_CHECKOUT_V2` mới
   * nhận). `invoiceService.checkout` tự lược field này khỏi payload nhánh v1
   * cũ (`/invoices/:id/checkout` không khai báo trường này —
   * `forbidNonWhitelisted` của backend sẽ 400 nếu gửi nhầm).
   */
  selectedProgramIds?: string[];
  /**
   * Id các CTKM thu ngân bỏ hẳn, kể cả `auto_apply=true` (UOW-09/ADR-07, đóng
   * A-13). Cùng ngoại lệ nhánh v1 như `selectedProgramIds` ở trên.
   */
  excludedProgramIds?: string[];
}

/**
 * Body cho `POST /v2/pos/checkout` — luồng checkout saga (T-05-03, cờ
 * `VITE_CHECKOUT_V2`). Khác `CheckoutInvoiceBody`: `invoiceId` nằm trong
 * body vì endpoint không có `:id` trên path.
 */
export interface CheckoutV2Body {
  invoiceId: string;
  payments: InvoicePaymentLineBody[];
  /** Mirror `CheckoutInvoiceBody.keptChangeAmount` — xem docblock ở đó. */
  keptChangeAmount?: number;
  dueDate?: string;
  creditDays?: number;
  /** Mirror `CheckoutInvoiceBody.selectedProgramIds` — xem docblock ở đó. */
  selectedProgramIds?: string[];
  /** Mirror `CheckoutInvoiceBody.excludedProgramIds` — xem docblock ở đó. */
  excludedProgramIds?: string[];
}

/**
 * Đáp trả thô của `POST /v2/pos/checkout` — KHÔNG phải `InvoiceRow` đầy đủ,
 * chỉ tổng kết saga. `invoiceService.checkout` tự gọi lại `getById` sau khi
 * commit để lấy đúng hình dạng phần còn lại của app đang mong đợi.
 */
export interface CheckoutV2Response {
  committed: boolean;
  invoiceId: string;
  sagaId: string;
  documentNumber?: string;
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
  /** Số tiền KM đã tính — BE bỏ qua khi có `lineDiscountType`. */
  lineDiscount?: number;
  /** KM thủ công theo dòng: BE tự tính số tiền giảm + `lineTotal` từ bộ ba này. */
  lineDiscountType?: "percent" | "amount";
  lineDiscountValue?: number;
  lineDiscountReason?: string;
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
  /**
   * Hóa đơn bán gốc. Bỏ trống ở luồng **đổi trả nhanh** — BE suy ra chế độ
   * quick từ chính việc thiếu field này (không có field `mode` riêng). Phải là
   * `undefined` chứ không phải `null`: DTO backend khai `@IsUUID` nên `null`
   * lọt qua `JSON.stringify` sẽ bị `ValidationPipe` từ chối 400.
   */
  originalInvoiceId?: string;
  reason: string;
  customerId?: string;
  /**
   * Hàng trả lại (direction=IN). Trỏ về dòng hóa đơn bán gốc khi có
   * `originalInvoiceId`; ở luồng nhanh thì mọi dòng phải bỏ trống
   * `originalInvoiceItemId`.
   */
  returnLines: ReturnInvoiceLineBody[];
  /** Hàng mua mới (direction=OUT) — cùng shape dòng hàng SALE thường. */
  newLines: CreateInvoiceItemBody[];
}

/**
 * Body cho `POST /invoices/:id/checkout-return` — tất toán đơn trả/đổi.
 * BE tự resolve tài khoản doanh thu (contra) — FE không gửi `revenueAccountId`.
 * `payments` chỉ cần khi EXCHANGE có netAmount > 0. `cashAccountId` để trống → BE
 * lấy theo ca quỹ đang mở.
 */
export interface CheckoutReturnBody {
  refundMethod: RefundMethod;
  cashAccountId?: string;
  /** Bắt buộc khi refundMethod = BANK: payment_accounts.id quỹ nhận hoàn (BE tự
   * suy ra deposit_account_id + COA). */
  refundAccountId?: string;
  receivableAccountId?: string;
  creditLiabilityAccountId?: string;
  creditExpiresAt?: string;
  payments?: InvoicePaymentLineBody[];
  /** EXCHANGE net > 0: hạn nợ cho phần chênh khách chưa thanh toán (ghi vào công nợ). */
  dueDate?: string;
  creditDays?: number;
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
  /** Bỏ trống = cả hoá đơn bán lẫn hoá đơn đổi (server tự giới hạn ở hai loại đó). */
  type?:          "SALE" | "EXCHANGE";
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
  /** Cùng đại lượng với cột "Tổng thanh toán" đang hiển thị (đổi tên từ `totalPaid`). */
  totalAmount?: CompareFilter;
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
  /**
   * Tổng của **toàn bộ** tập khớp bộ lọc, không phải trang hiện tại. Cùng kiểu
   * `ReportTotals` với mọi lưới khác trong hệ thống.
   *
   * `totalAmount` là "Tổng thanh toán" có dấu — đơn trả/đổi mang giá trị âm,
   * đúng như `getInvoiceSignedTotal` tính cho từng dòng.
   */
  totals: { totalAmount: number };
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

/** Body của `POST /invoices/:id/cancel`. */
export interface CancelInvoiceBody {
  /** Lý do huỷ, bắt buộc — hiển thị lại trên hoá đơn đã huỷ. */
  reason: string;
}
