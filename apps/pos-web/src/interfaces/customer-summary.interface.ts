import type { MembershipTierEnum } from "@erp/pos/types/customer.type";

/** Tổng chi tiêu + số lượng hóa đơn của khách (loyalty: chỉ tính hóa đơn đã chốt). */
export interface CustomerPurchasesSummary {
  totalSpending: number;
  invoiceCount: number;
}

/** Tổng dư nợ + số chứng từ còn nợ. */
export interface CustomerDebtSummary {
  totalOutstanding: number;
  documentCount: number;
}

/** Tóm tắt thẻ thành viên — null khi khách chưa có thẻ active. */
export interface CustomerMembershipSummary {
  cardNumber: string;
  tier: MembershipTierEnum;
  /** Điểm khả dụng (balance). */
  points: number;
  /** Tổng điểm đã đổi (lifetime). */
  pointsUsed: number;
}

/**
 * Response của `GET /customers/:id/summary` — mirror `CustomerSummaryResponseDto`
 * ở BE (`apps/api/src/modules/customer/services/customer-summary.service.ts`).
 */
export interface CustomerSummary {
  customerId: string;
  purchases: CustomerPurchasesSummary;
  debt: CustomerDebtSummary;
  membership: CustomerMembershipSummary | null;
}
