import { useQuery } from "@tanstack/react-query";
import type {
  DashboardSummary,
  SalesSummary,
  InventoryValuation,
  AgingReport,
  CashReconciliation,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../lib/erp-api";

interface ReportParams {
  branchId?: string;
  startDate?: string;
  endDate?: string;
}

function reportQuery(
  params: ReportParams,
): Record<string, string> | undefined {
  const q: Record<string, string> = {};
  if (params.branchId) q.branchId = params.branchId;
  if (params.startDate) q.startDate = params.startDate;
  if (params.endDate) q.endDate = params.endDate;
  return Object.keys(q).length ? q : undefined;
}

function useReportQuery<T>(path: string, params: ReportParams) {
  return useQuery({
    queryKey: [
      "reports",
      path,
      params.branchId,
      params.startDate,
      params.endDate,
    ],
    queryFn: async () => {
      const q = reportQuery(params);
      return requireErpData(
        await erpApi.GET<T>(path, q ? { params: { query: q } } : undefined),
      );
    },
  });
}

export function useDashboard(params: ReportParams) {
  return useReportQuery<DashboardSummary>("/reports/dashboard", params);
}

export function useSalesSummary(params: ReportParams) {
  return useReportQuery<SalesSummary>("/reports/sales-summary", params);
}

export function useInventoryValuation(params: ReportParams) {
  return useReportQuery<InventoryValuation[]>(
    "/reports/inventory-valuation",
    params,
  );
}

export function useReceivablesAging(params: ReportParams) {
  return useReportQuery<AgingReport>("/reports/receivables-aging", params);
}

export function usePayablesAging(params: ReportParams) {
  return useReportQuery<AgingReport>("/reports/payables-aging", params);
}

export function useCashReconciliation(params: ReportParams) {
  return useReportQuery<CashReconciliation[]>(
    "/reports/cash-reconciliation",
    params,
  );
}
