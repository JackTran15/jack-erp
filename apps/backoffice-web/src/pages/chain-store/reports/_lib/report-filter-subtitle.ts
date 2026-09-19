import type { IDropdownOption } from "@erp/shared-interfaces";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type { ReportFilterValues } from "../../../../store/page-stores/report/report.interface";

/**
 * Phụ đề dưới tiêu đề báo cáo quỹ tiền, dựng từ bộ lọc ĐÃ áp dụng (không phải
 * bộ lọc đang gõ) — cùng chữ với `cashFundFilterSummary` phía BE dùng cho tài
 * liệu in/xuất, để màn hình và bản in nói cùng một thứ.
 *
 * Nhãn tra từ options đã tải (cache TanStack của `useReportFilterOptions`);
 * `StoreScopeValue` chỉ giữ id nên khi options chưa về thì in số lượng thay tên.
 */

export interface FilterSubtitleInput {
  /** Các dòng filter mà registry của báo cáo khai báo (theo chế độ xem hiện tại). */
  filterLines: readonly REPORT_FILTERS_LINE[];
  filters: Partial<ReportFilterValues>;
  storeOptions?: readonly IDropdownOption[];
  employeeOptions?: readonly IDropdownOption[];
}

const ALL_LABEL = "Tất cả";

function labelById(
  options: readonly IDropdownOption[] | undefined,
  id: string,
): string | undefined {
  return options?.find((o) => String(o.value) === id)?.label;
}

/** "Xem theo cửa hàng: Tất cả" | "Xem theo cửa hàng: A, B" | "Xem theo cửa hàng: 2 cửa hàng" (chưa có tên). */
export function buildStoreSubtitle(
  store: ReportFilterValues[REPORT_FILTERS_LINE.STORE] | undefined,
  storeOptions?: readonly IDropdownOption[],
): string {
  const prefix = "Xem theo cửa hàng: ";
  if (!store || store.scope !== "group" || store.storeIds.length === 0) {
    return prefix + ALL_LABEL;
  }
  const names = store.storeIds
    .map((id) => labelById(storeOptions, id))
    .filter((name): name is string => Boolean(name));
  if (names.length === store.storeIds.length) return prefix + names.join(", ");
  return `${prefix}${store.storeIds.length} cửa hàng`;
}

/** "Nhân viên: Tất cả" | "Nhân viên: <nhãn option>" (nhãn chưa tải → in id). */
export function buildEmployeeSubtitle(
  employeeId: string | undefined,
  employeeOptions?: readonly IDropdownOption[],
): string {
  const prefix = "Nhân viên: ";
  if (!employeeId || employeeId === "all") return prefix + ALL_LABEL;
  return prefix + (labelById(employeeOptions, employeeId) ?? employeeId);
}

/** Một phần tử mỗi dòng, theo thứ tự cửa hàng → nhân viên; rỗng nếu registry không khai báo dòng nào. */
export function buildFilterSubtitleLines({
  filterLines,
  filters,
  storeOptions,
  employeeOptions,
}: FilterSubtitleInput): string[] {
  const lines: string[] = [];
  if (filterLines.includes(REPORT_FILTERS_LINE.STORE)) {
    lines.push(buildStoreSubtitle(filters[REPORT_FILTERS_LINE.STORE], storeOptions));
  }
  if (filterLines.includes(REPORT_FILTERS_LINE.EMPLOYEE)) {
    lines.push(
      buildEmployeeSubtitle(filters[REPORT_FILTERS_LINE.EMPLOYEE], employeeOptions),
    );
  }
  return lines;
}
