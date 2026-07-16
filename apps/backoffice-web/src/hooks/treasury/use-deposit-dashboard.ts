import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface DashboardAccountBalance {
  accountId: string;
  name: string;
  type: string;
  balance: string;
}

export interface DashboardBranchBalance {
  branchId: string;
  branchName?: string | null;
  accounts: DashboardAccountBalance[];
  branchTotal: string;
}

export interface OrgBalanceDashboard {
  branches: DashboardBranchBalance[];
  accountsTotal: string;
  inTransitTotal: string;
  /** R5 — invariant across create/confirm: Σ(deposit_accounts.balance) + Σ(in-transit). */
  grandTotal: string;
}

/**
 * GĐ4 — dashboard số dư toàn hệ thống (FR-07). GET /deposit/dashboard.
 * Not branch-header-gated — aggregates across every branch the actor is
 * assigned to (BR-PERM-01, same as the in-transit report).
 */
export function useDepositDashboard() {
  return useQuery({
    queryKey: treasuryQueryKeys.depositDashboard(),
    queryFn: async () =>
      requireErpData(await erpApi.GET<OrgBalanceDashboard>("/deposit/dashboard")),
    staleTime: 15_000,
  });
}
