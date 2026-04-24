import { useState, useEffect, useCallback } from "react";
import { http } from "../lib/http";
import type {
  DashboardSummary,
  SalesSummary,
  InventoryValuation,
  AgingReport,
  CashReconciliation,
} from "@erp/shared-interfaces";

interface ReportParams {
  branchId?: string;
  startDate?: string;
  endDate?: string;
}

function buildQuery(params: ReportParams): string {
  const parts: string[] = [];
  if (params.branchId) parts.push(`branchId=${params.branchId}`);
  if (params.startDate) parts.push(`startDate=${params.startDate}`);
  if (params.endDate) parts.push(`endDate=${params.endDate}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function useReportData<T>(endpoint: string, params: ReportParams) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(params);
      const result = await http.get<T>(`/reports/${endpoint}${qs}`);
      setData(result);
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch report");
    } finally {
      setLoading(false);
    }
  }, [endpoint, params.branchId, params.startDate, params.endDate]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useDashboard(params: ReportParams) {
  return useReportData<DashboardSummary>("dashboard", params);
}

export function useSalesSummary(params: ReportParams) {
  return useReportData<SalesSummary>("sales-summary", params);
}

export function useInventoryValuation(params: ReportParams) {
  return useReportData<InventoryValuation[]>("inventory-valuation", params);
}

export function useReceivablesAging(params: ReportParams) {
  return useReportData<AgingReport>("receivables-aging", params);
}

export function usePayablesAging(params: ReportParams) {
  return useReportData<AgingReport>("payables-aging", params);
}

export function useCashReconciliation(params: ReportParams) {
  return useReportData<CashReconciliation[]>("cash-reconciliation", params);
}
