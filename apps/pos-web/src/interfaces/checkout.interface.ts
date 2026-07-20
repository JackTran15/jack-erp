import type { PaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type { PaymentMethod } from "@erp/pos/constants/checkout.constant";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";
import type { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import type { PosProductKind } from "@erp/pos/types/catalog.type";
import type { VoucherFormResult } from "@erp/pos/dtos/voucher.dto";

export interface InvoiceTabItem {
  id: string;
  label: string;
  isDraft?: boolean;
  /**
   * Optional count badge rendered at the top-right of the tab. Hidden when
   * undefined or `<= 0`. Used by the "HĐ lưu tạm" tab to surface the number
   * of saved drafts; reusable for any future per-tab counters.
   */
  badgeCount?: number;
}

/**
 * Khuyến mại dòng (line-level discount). 3 field đi cùng nhau — `lineDiscount`
 * undefined = không khuyến mại. Lưu local trong session draft; chưa wire BE
 * (mapper invoice vẫn gửi `lineDiscount: 0`).
 */
export interface CartLineDiscount {
  type: "percent" | "amount";
  /** % (0-100) khi `type=percent` hoặc số VNĐ khi `type=amount`. */
  value: number;
  /** Lý do bắt buộc, hiển thị trong dòng KM đỏ trên row. */
  reason: string;
}

/** Single line in the active invoice cart. Identical to legacy CheckoutPage. */
export interface CartLine {
  lineId: string;
  itemId: string;
  name: string;
  code: string;
  unit: string;
  unitPrice: number;
  qty: number;
  locationId: string;
  maxQty: number;
  /**
   * Dòng bán chưa xác định được tồn kho: khôi phục từ hóa đơn nháp / tab đã lưu,
   * hoặc `syncPurchaseCartOnHand` không tìm thấy item trong catalog. Khi true,
   * `maxQty` KHÔNG đáng tin và phải coi dòng này là **cần xác minh** trước khi
   * thanh toán — không mặc định là an toàn. Xóa cờ ngay khi sync được tồn thật.
   */
  onHandUnknown?: boolean;
  /**
   * When true (invoice_return): qty is a positive count of units returned;
   * monetary effect is negative (refund credit). UI shows negative qty / pink row.
   */
  isReturnCredit?: boolean;
  /**
   * Đơn trả `regular`: id của dòng hóa đơn bán gốc (`invoice_items.id`) mà dòng
   * trả này tham chiếu. Bắt buộc để BE cộng `returned_quantity` đúng dòng. Bỏ
   * trống ở đơn trả `quick` (không có hóa đơn gốc).
   */
  originalInvoiceItemId?: string;
  /** KM dòng — undefined = không KM. */
  lineDiscount?: CartLineDiscount;
  /** Ghi chú nội bộ cho dòng — undefined = không ghi chú. */
  note?: string;
}

export interface CatalogProduct {
  /** Product id (kind=PRODUCT) hoặc item id (kind=ITEM). */
  id: string;
  name: string;
  /** Giá thấp nhất trong các biến thể (minPrice). */
  price: number;
  /** Loại card → dùng mở dialog chọn biến thể đúng kind. */
  kind: PosProductKind;
}

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

/** One sales-channel row in the "Tại cửa hàng" selector popover. */
export interface SaleChannelOption {
  id: string;
  label: string;
  /** Tailwind class nền cho bubble tròn 40px, vd "bg-[#1877F2]". */
  bubbleClassName: string;
  /** Chữ cái hiển thị trong bubble; bỏ trống nếu dùng icon storefront. */
  initial?: string;
  /** true => render StoreIcon trong bubble (kênh "Tại cửa hàng"). */
  isStore?: boolean;
}

export interface CashSuggestion {
  id: string;
  amount: number;
}

/** Bảng giá (toolbar selector). Tạm dùng option tĩnh — chờ API. */
export interface PriceBook {
  id: string;
  name: string;
}

/** Nhân viên bán hàng (toolbar selector). Tạm dùng option tĩnh — chờ API. */
export interface Salesperson {
  id: string;
  name: string;
  code: string;
}

/** Nhóm hàng hoá (catalog group filter) — phẳng hoá từ cây nhóm hàng hóa để hiển thị thụt lề. */
export interface ProductGroup {
  id: string;
  name: string;
  /** Độ sâu trong cây (0 = gốc / "Tất cả") để thụt lề khi render. */
  depth?: number;
  parentGroupId?: string | null;
}

/**
 * One payment entry inside a saved draft. Denormalized by design — we capture
 * the human label at save time so a draft keeps its display string even if
 * the live `PAYMENT_METHODS` table is later renamed.
 */
export interface DraftInvoicePayment {
  method: PaymentMethod;
  /** Human label, e.g. "Tiền mặt". */
  label: string;
  amount: number;
}

/**
 * Snapshot of a cart saved as a draft invoice. Listed in the draft picker
 * and opened on a **new** invoice tab when the user confirms.
 * Self-contained: `lines` and `payments` are deep-cloned at save time so
 * later edits to the live cart do not mutate the draft.
 */
export interface DraftInvoice {
  id: string;
  /** Display number — e.g. "2605010010". */
  invoiceNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** When the draft was created. */
  createdAt: Date;
  /** Snapshot of cart lines at save time. */
  lines: CartLine[];
  /** Pre-computed total (= sum of qty × unitPrice). */
  total: number;
  /**
   * Snapshot of the multi-line payment state (`PaymentMethodList`) at save
   * time. Optional so older snapshots without payment data still load.
   */
  payments?: DraftInvoicePayment[];
  /** When set, restore splits carts for quick_exchange. */
  checkoutVariant?: CheckoutVariantEnum;
  quickExchangePurchase?: CartLine[];
  quickExchangeReturn?: CartLine[];
}

// ============================================================================
// Per-tab checkout draft
// ============================================================================
// Tất cả trạng thái "đang soạn" của 1 tab hóa đơn (ngoài giỏ hàng) — khách,
// thanh toán, khuyến mãi, nhãn đã chọn, NV bán/bảng giá, filter catalog. Được
// nhúng vào `InvoiceSession.draft` để mỗi tab giữ riêng trạng thái khi chuyển
// qua lại và khi reload (session store đã persist). Tách slice lồng nhau để
// hook có thể subscribe từng slice (reference ổn định, tránh re-render thừa).

export interface CheckoutCustomerDraft {
  selectedCustomer: CustomerRow | null;
  customerQuery: string;
}

export interface CheckoutPaymentDraft {
  paymentLines: PaymentLine[];
  keepChange: boolean;
  debt: boolean;
  /**
   * Chỉ dùng ở luồng hoàn tiền (return/exchange net<0): tích "Tính vào công nợ"
   * để bù trừ khoản hoàn vào công nợ hóa đơn gốc (refundMethod=OFFSET) thay vì
   * chi tiền mặt. Optional cho draft cũ đã persist (coerce về false khi đọc).
   */
  refundToDebt?: boolean;
  note: string;
  printInvoice: boolean;
  /** In 2 liên trong 1 lệnh in (1 cho khách, 1 cửa hàng lưu). */
  printDuplicate: boolean;
  preorder: boolean;
  selectedSuggestionId: string | null;
  deposit: number;
  /**
   * Phí đổi trả (chỉ dùng ở tab return / quick-exchange) — khách trả thêm, cộng
   * vào số phải thu / trừ vào số hoàn. 0 ở tab bán thường.
   */
  returnFee: number;
  /**
   * Hạn thanh toán công nợ (ISO `YYYY-MM-DD`), chọn ở modal "Hạn thanh toán".
   * Chỉ lưu frontend state — BE chưa có field tương ứng. `null` = chưa đặt.
   */
  paymentDueDate: string | null;
  /** Số ngày được nợ (đồng bộ 2 chiều với `paymentDueDate`). `null` = chưa đặt. */
  creditDays: number | null;
}

export interface CheckoutPromotionDraft {
  appliedPromotion: PromotionItem | null;
  /**
   * Số điểm khách dùng để giảm giá (1 điểm = 1.000đ, hằng số khớp BE
   * `POINT_REDEMPTION_VALUE_VND`). Lưu trong draft local, chỉ thực sự áp lên
   * BE ở bước finalize (`POST /invoices/:id/redeem-points` ngay trước
   * `/checkout`). 0 = không dùng điểm.
   */
  pointsRedeemed: number;
  /**
   * Voucher khách đã chọn trong `VoucherDialog`. BE chưa có endpoint
   * apply-voucher → giữ ở local để hiển thị chip "Voucher: {code}" trên right
   * pane, không gửi lên `/checkout`.
   */
  appliedVoucher: VoucherFormResult | null;
}

export interface CheckoutLabelsDraft {
  /** Id nhãn đã gán cho đơn này (định nghĩa nhãn nằm ở store labels toàn cục). */
  selectedLabelIds: string[];
}

export interface CheckoutMetaDraft {
  selectedSalesperson: Salesperson | null;
  selectedPriceBook: PriceBook | null;
}

export interface CheckoutCatalogToolbarDraft {
  query: string;
  qty: number;
  splitLine: boolean;
}

export interface CheckoutCatalogDraft {
  toolbar: CheckoutCatalogToolbarDraft;
  catalogQuery: string;
  catalogGroup: string | undefined;
  catalogCollapsed: boolean;
}

/** Toàn bộ trạng thái soạn thảo per-tab, nhúng trong `InvoiceSession.draft`. */
export interface CheckoutDraft {
  customer: CheckoutCustomerDraft;
  payment: CheckoutPaymentDraft;
  promotion: CheckoutPromotionDraft;
  labels: CheckoutLabelsDraft;
  meta: CheckoutMetaDraft;
  catalog: CheckoutCatalogDraft;
}
