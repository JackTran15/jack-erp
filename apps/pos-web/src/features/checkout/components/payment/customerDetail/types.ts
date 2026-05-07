import type {
  CustomerDetailTabKey,
  CustomerGender,
  PurchaseHistoryStatus,
} from "../../../constants/customer";

export {
  CustomerDetailTabKeyEnum,
  CustomerGenderEnum,
  PurchaseHistoryStatusEnum,
  type CustomerDetailTabKey,
  type CustomerGender,
  type PurchaseHistoryStatus,
} from "../../../constants/customer";

/**
 * Data contracts for `CustomerDetailDialog`.
 *
 * Shapes are intentionally loose (everything optional except `name`) so the
 * caller can supply whatever it has — the dialog falls back to "Chưa có
 * thông tin" placeholders for missing fields. Replace fields with real
 * backend data when the customer-detail API lands.
 */

export interface CustomerDetailIdentity {
  /** Internal customer id, mirrors `CustomerRow.id`. */
  id?: string;
  /** Display name — required because the title shows "Khách hàng: {name}". */
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Public-facing customer code, e.g. "KH000016". */
  code?: string | null;
  cccd?: string | null;
  birthday?: string | null;
  gender?: CustomerGender | null;
  address?: string | null;
}

export interface CustomerMembershipData {
  /** "Mã thẻ thành viên" — e.g. "100000001". */
  cardCode?: string | null;
  /** "Hạng thẻ Lomas" — e.g. "Bạc". */
  tier?: string | null;
  /** Loyalty point balance. */
  loyaltyPoints?: number;
  /** Points used so far (for the progress bar). */
  pointsUsed?: number;
  /** Soft cap used to render the progress bar; defaults to a sensible value. */
  pointsCap?: number;
  /** "Nhóm KH". */
  customerGroup?: string | null;
  /** "Nhân viên phụ trách". */
  accountManager?: string | null;
}

export interface CustomerCompanyInfo {
  companyName?: string | null;
  taxCode?: string | null;
  note?: string | null;
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
  date: Date;
  documentNumber: string;
  documentType: string;
  amount: number;
  remainingDebt: number;
  branch: string;
}

export interface CustomerDetailData {
  identity: CustomerDetailIdentity;
  membership?: CustomerMembershipData;
  company?: CustomerCompanyInfo;
  stats?: CustomerStatsData;
  purchaseHistory?: PurchaseHistoryEntry[];
  debts?: DebtEntry[];
}

