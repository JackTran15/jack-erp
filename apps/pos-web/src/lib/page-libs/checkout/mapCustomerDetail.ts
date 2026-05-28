import type { CustomerDetail } from "@erp/pos/interfaces/customer.interface";
import type { CustomerDetailData } from "@erp/pos/interfaces/customer-detail.interface";
import type { CustomerSummary } from "@erp/pos/interfaces/customer-summary.interface";
import type { MembershipCard } from "@erp/pos/interfaces/membership-card.interface";

export interface MapCustomerDetailLookups {
  /** Resolves `groupId` to a human-readable group name. */
  groupNameById?: ReadonlyMap<string, string>;
  /** Resolves `assignedStaffId` to a staff display name. */
  staffNameById?: ReadonlyMap<string, string>;
  /** `GET /customers/:id/summary` — totals + membership snapshot. */
  summary?: CustomerSummary | null;
  /** `GET /customers/:id/membership-card` — null khi khách chưa có thẻ. */
  card?: MembershipCard | null;
}

/**
 * Pass the raw `CustomerDetail` from `GET /customers/:id` through to the
 * dialog with light enrichment:
 *  - resolves `groupId → groupName` and `assignedStaffId → staffName` when
 *    the corresponding lookup maps are supplied.
 *  - khi truyền `summary`/`card`: tách ra `stats`, `cardCode`, `tier`,
 *    `loyaltyPoints`, `pointsUsed` để tab "Tổng quan" có dữ liệu thật.
 *
 * Purchase history / debts vẫn được merge từ các fetch riêng (lazy theo tab).
 */
export function mapCustomerToDetailData(
  c: CustomerDetail,
  lookups: MapCustomerDetailLookups = {},
): CustomerDetailData {
  const { summary, card } = lookups;
  const membership = summary?.membership ?? null;
  return {
    ...c,
    groupName: c.groupId
      ? (lookups.groupNameById?.get(c.groupId) ?? null)
      : null,
    staffName: c.assignedStaffId
      ? (lookups.staffNameById?.get(c.assignedStaffId) ?? null)
      : null,
    // Stats panel — ưu tiên dữ liệu thật từ summary; fallback giữ undefined
    // để CustomerStatsPanel render EMPTY_STATS (toàn 0).
    stats: summary
      ? {
          totalSpent: summary.purchases.totalSpending,
          invoiceCount: summary.purchases.invoiceCount,
          debtTotal: summary.debt.totalOutstanding,
          debtDocumentCount: summary.debt.documentCount,
        }
      : undefined,
    // Thẻ thành viên — ưu tiên `card` (đủ field), fallback `membership` từ summary.
    cardCode: card?.cardNumber ?? membership?.cardNumber ?? null,
    tier: card?.tier ?? membership?.tier ?? null,
    loyaltyPoints: card?.points ?? membership?.points ?? 0,
    pointsUsed: membership?.pointsUsed ?? 0,
  };
}
