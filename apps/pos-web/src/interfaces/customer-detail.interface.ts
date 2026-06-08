import type { PurchaseHistoryStatus } from "@erp/pos/constants/checkout.constant";
import type { CustomerDetail } from "@erp/pos/interfaces/customer.interface";
import type { MembershipTierEnum } from "@erp/pos/types/customer.type";

/**
 * Data contract for `CustomerDetailDialog`.
 *
 * Mirrors the flat BE `CustomerDetail` response (same field names) and adds
 * a few UI-only enriched fields populated by the host page:
 *   - `groupName` / `staffName`  — resolved via lookup maps.
 *   - `cardCode`, `tier`, `loyaltyPoints`, `pointsUsed`, `pointsCap`
 *     — populated from `/customers/:id/membership-card`.
 *   - `stats`, `purchaseHistory`  — populated from their own endpoints when the
 *     corresponding tabs need data. (`DebtTab` fetches its own data directly.)
 *
 * Only `name` is required because the dialog title shows "Khách hàng: {name}".
 * Everything else is optional — missing values render as muted "Chưa có thông
 * tin" placeholders.
 */
export interface CustomerDetailData
  extends Partial<Omit<CustomerDetail, "name">> {
  /** Display name — required because the title shows "Khách hàng: {name}". */
  name: string;

  // UI-only enriched fields ---------------------------------------------------

  /** Display name resolved from `groupId` via the customer-groups lookup. */
  groupName?: string | null;
  /** Display name resolved from `assignedStaffId` via the staff lookup. */
  staffName?: string | null;

  /** "Mã thẻ thành viên" — e.g. "100000001". */
  cardCode?: string | null;
  /** "Hạng thẻ Lomas" — e.g. "Bạc". */
  tier?: MembershipTierEnum | null;
  /** Loyalty point balance. */
  loyaltyPoints?: number;
  /** Points used so far (for the progress bar). */
  pointsUsed?: number;
  /** Soft cap used to render the progress bar; defaults to a sensible value. */
  pointsCap?: number;

  // Other-tab data ------------------------------------------------------------

  stats?: CustomerStatsData;
  purchaseHistory?: PurchaseHistoryEntry[];
}

export interface CustomerStatsData {
  totalSpent: number;
  invoiceCount: number;
  debtTotal: number;
  debtDocumentCount: number;
}

export interface PurchaseHistoryEntry {
  id: string;
  invoiceDate: Date;
  invoiceNumber: string;
  storeName: string;
  status: PurchaseHistoryStatus;
  totalAmount: number;
  note?: string;
}

export interface DebtEntry {
  id: string;
  /** Hóa đơn nguồn của công nợ — mở `InvoiceReceiptDialog` khi click số chứng từ. */
  invoiceId: string;
  date: Date;
  documentNumber: string;
  documentType: string;
  amount: number;
  remainingDebt: number;
  branch: string;
}
