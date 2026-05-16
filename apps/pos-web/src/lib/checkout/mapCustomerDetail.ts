import type { CustomerDetail } from "@erp/pos/lib/customerApi";
import type { CustomerDetailData } from "./customerDetail.types";

export interface MapCustomerDetailLookups {
  /** Resolves `groupId` to a human-readable group name. */
  groupNameById?: ReadonlyMap<string, string>;
  /** Resolves `assignedStaffId` to a staff display name. */
  staffNameById?: ReadonlyMap<string, string>;
}

/**
 * Pass the raw `CustomerDetail` from `GET /customers/:id` through to the
 * dialog with light enrichment:
 *  - resolves `groupId → groupName` and `assignedStaffId → staffName` when
 *    the corresponding lookup maps are supplied.
 *
 * Membership card / stats / purchase history / debts are owned by other
 * fetches and merged in by the host page when available.
 */
export function mapCustomerToDetailData(
  c: CustomerDetail,
  lookups: MapCustomerDetailLookups = {},
): CustomerDetailData {
  return {
    ...c,
    groupName: c.groupId
      ? (lookups.groupNameById?.get(c.groupId) ?? null)
      : null,
    staffName: c.assignedStaffId
      ? (lookups.staffNameById?.get(c.assignedStaffId) ?? null)
      : null,
  };
}
