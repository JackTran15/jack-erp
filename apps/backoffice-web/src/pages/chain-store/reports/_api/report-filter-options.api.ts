import {
  type IDropdownOption,
  type ReportFilterOptionType,
} from "@erp/shared-interfaces";
import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import {
  getReportBackendSource,
} from "../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../store/page-stores/report/report.context";

type OptionsSource = "invoice" | "inventory" | "debt" | "profit" | "cash";

/**
 * Dropdown của domain quỹ tiền — BE `CashFundFilterOptionType` (domain-local,
 * không nằm trong `ReportFilterOptionType` dùng chung). `store` trùng giá trị
 * với enum chung; ba loại còn lại chỉ có nghĩa với `/reports/cash-fund`.
 */
export type CashFundFilterOptionType =
  | "store"
  | "employee"
  | "paymentMethod"
  | "expenseCategory";

/** `type` mà mọi endpoint filter-options nhận — enum chung hoặc loại riêng của quỹ tiền. */
export type ReportFilterOptionsType = ReportFilterOptionType | CashFundFilterOptionType;

const OPTIONS_PATH: Record<
  OptionsSource,
  | "/reports/invoices/filter-options"
  | "/reports/inventory/filter-options"
  | "/reports/debts/filter-options"
  | "/reports/profit/filter-options"
  | "/reports/cash-fund/filter-options"
> = {
  invoice: "/reports/invoices/filter-options",
  inventory: "/reports/inventory/filter-options",
  debt: "/reports/debts/filter-options",
  profit: "/reports/profit/filter-options",
  cash: "/reports/cash-fund/filter-options",
};

// Gọi API options dropdown dùng chung (phân biệt bằng `type`, hỗ trợ search).
// `branchIds` giới hạn options theo chi nhánh (hiện dùng cho type=warehouse).
export async function fetchReportFilterOptions(
  type: ReportFilterOptionsType,
  search?: string,
  source: OptionsSource = "invoice",
  branchIds?: string[],
): Promise<IDropdownOption[]> {
  return requireErpData(
    await erpApi.GET<IDropdownOption[]>(OPTIONS_PATH[source], {
      params: {
        query: {
          type,
          search: search || undefined,
          // Comma-joined: openapi-fetch serialize mảng thành `branchIds[]=`
          // (bracket) → bị ValidationPipe whitelist chặn; backend Transform
          // split chuỗi comma sẵn.
          branchIds: branchIds?.length ? branchIds.join(",") : undefined,
        },
      },
    }),
  );
}

// Hook đổ options cho 1 dropdown filter. Endpoint chọn theo domain của report
// đang mở (invoice vs inventory). queryKey gồm branchIds để cache theo scope.
export function useReportFilterOptions(
  type: ReportFilterOptionsType,
  search?: string,
  params?: { branchIds?: string[] },
) {
  const reportType = useReportStore((s) => s.reportType);
  const source = getReportBackendSource(reportType);
  const branchIds = params?.branchIds?.length ? params.branchIds : undefined;
  return useQuery({
    queryKey: ["report-filter-options", source, type, search ?? "", branchIds ?? []],
    queryFn: () => fetchReportFilterOptions(type, search, source, branchIds),
    enabled: Boolean(type),
    staleTime: 60_000,
  });
}
