import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { treasuryQueryKeys } from "./treasury-query-keys";

export interface InTransitRow {
  id: string;
  amount: string;
  fromBranchId: string;
  fromBranchName?: string | null;
  toBranchId: string;
  toBranchName?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  initiatedAt: string;
  initiatedBy: string;
  daysInTransit: number;
  isOverdue: boolean;
}

export interface InTransitReport {
  total: string;
  staleDays: number;
  data: InTransitRow[];
}

export interface InTransitQuery {
  branchId?: string;
  accountId?: string;
  staleDays?: number;
}

/**
 * GĐ4 — báo cáo "Tiền đang chuyển" (FR-07). GET /deposit-transfers/in-transit.
 * Not branch-header-gated — aggregates across every branch the actor is
 * assigned to (BR-PERM-01), so FE renders whatever comes back without
 * re-filtering by the active branch.
 */
export function useDepositInTransit(query: InTransitQuery = {}) {
  return useQuery({
    queryKey: treasuryQueryKeys.depositInTransit(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<InTransitReport>("/deposit-transfers/in-transit", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    staleTime: 15_000,
  });
}
