import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  IDropdownOption,
  InvoiceReportResult,
  InvoiceReportSearchPayload,
  PosDailySummaryDetailResult,
  PosDailySummaryResult,
} from "@erp/shared-interfaces";

import { DAILY_REPORT_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { dailyReportService } from "@erp/pos/services/daily-report.service";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import type {
  PosDailySummaryBody,
  PosDailySummaryDetailBody,
  PosDailySummaryExportBody,
} from "@erp/pos/dtos/daily-report.dto";

/** Tab Tổng hợp — `POST /reports/pos/daily-summary`. */
export function useDailySummaryQuery(
  body: PosDailySummaryBody,
): UseQueryResult<PosDailySummaryResult, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<PosDailySummaryResult, Error>({
    queryKey: DAILY_REPORT_KEYS.SUMMARY({ ...body, branchId }),
    queryFn: () => dailyReportService.getDailySummary(body),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Tab Doanh thu theo mặt hàng — `POST /reports/invoices/search` (revenue-by-item). */
export function useRevenueByItemReportQuery(
  body: InvoiceReportSearchPayload,
): UseQueryResult<InvoiceReportResult, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<InvoiceReportResult, Error>({
    queryKey: DAILY_REPORT_KEYS.REVENUE_BY_ITEM({ ...body, branchId }),
    queryFn: () => dailyReportService.searchRevenueByItem(body),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Thu ngân / NVBH dropdown options (`GET /reports/invoices/filter-options`). */
export function useReportFilterOptionsQuery(
  type: string,
): UseQueryResult<IDropdownOption[], Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<IDropdownOption[], Error>({
    queryKey: DAILY_REPORT_KEYS.FILTER_OPTIONS(type, branchId),
    queryFn: () => dailyReportService.getFilterOptions(type),
    staleTime: 5 * 60_000,
  });
}

/** "Xem chi tiết" modal — `POST /reports/pos/daily-summary/detail`. Disabled while the modal is closed. */
export function useDailySummaryDetailQuery(
  body: PosDailySummaryDetailBody,
  enabled: boolean,
): UseQueryResult<PosDailySummaryDetailResult, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<PosDailySummaryDetailResult, Error>({
    queryKey: DAILY_REPORT_KEYS.SUMMARY_DETAIL({ ...body, branchId }),
    queryFn: () => dailyReportService.getDailySummaryDetail(body),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** Tab Tổng hợp "Xuất" — `POST /reports/pos/daily-summary/export`, returns the .xlsx as a Blob. */
export function useExportDailySummaryMutation(): UseMutationResult<
  Blob,
  Error,
  PosDailySummaryExportBody
> {
  return useMutation({
    mutationFn: (body: PosDailySummaryExportBody) =>
      dailyReportService.exportDailySummary(body),
  });
}
