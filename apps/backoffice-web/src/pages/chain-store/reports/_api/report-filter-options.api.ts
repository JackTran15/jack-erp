import {
  type IDropdownOption,
  type ReportFilterOptionType,
} from "@erp/shared-interfaces";
import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../../lib/erp-api";

// Gọi API options dropdown dùng chung (phân biệt bằng `type`, hỗ trợ search).
export async function fetchReportFilterOptions(
  type: ReportFilterOptionType,
  search?: string,
): Promise<IDropdownOption[]> {
  return requireErpData(
    await erpApi.GET<IDropdownOption[]>("/reports/invoices/filter-options", {
      params: { query: { type, search: search || undefined } },
    }),
  );
}

// Hook đổ options cho 1 dropdown filter. queryKey theo resource + type + search.
export function useReportFilterOptions(
  type: ReportFilterOptionType,
  search?: string,
) {
  return useQuery({
    queryKey: ["report-filter-options", type, search ?? ""],
    queryFn: () => fetchReportFilterOptions(type, search),
    enabled: Boolean(type),
    staleTime: 60_000,
  });
}
