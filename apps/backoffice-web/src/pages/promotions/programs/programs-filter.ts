import { PromotionStatus } from "@erp/shared-interfaces";
import type { ColumnFilter, ColumnFilterMode } from "../../../components/table/pagination.dto";
import type {
  PromotionSearchFilters,
  StringFilter,
} from "../api/use-promotions";
import {
  PROMOTION_APPLY_TO_LABELS_VI,
  PROMOTION_STATUS_LABELS_VI,
  PROMOTION_TYPE_LABELS_VI,
} from "./programs.constants";

/** 5 toán tử text của FR-003 map thẳng vào `StringOperator` phía API. */
const STRING_OPERATOR: Record<ColumnFilterMode, StringFilter["operator"]> = {
  contains: "*",
  equals: "=",
  startsWith: "+",
  endsWith: "-",
  notContains: "!",
};

function stringFilter(filter?: ColumnFilter): StringFilter | undefined {
  if (!filter?.value) return undefined;
  return { operator: STRING_OPERATOR[filter.mode], value: filter.value };
}

/** Cột enum: mục "Tất cả" gửi `undefined`, **không** gửi chuỗi rỗng. */
function enumFilter(filter?: ColumnFilter) {
  return filter?.value ? { value: filter.value } : undefined;
}

function dateRange(filter?: ColumnFilter) {
  if (!filter?.from && !filter?.to) return undefined;
  return { from: filter.from, to: filter.to };
}

export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * Gộp bộ lọc kỳ + lọc từng cột + bộ lọc trạng thái mặc định thành body của
 * `POST /v2/promotions/search`.
 *
 * API **không** tự lọc `status` (nó không được âm thầm ẩn dữ liệu). Mặc định
 * hiện là "Tất cả" — `trackingOnly` không còn được truyền `true` từ
 * `ProgramsPage.tsx` (FR-004/AC-10 đảo ngược 2026-08-10, T-03-06) — tham số
 * này vẫn còn vì cột lọc trạng thái do người dùng tự đặt vẫn cần thắng nó.
 */
export function buildPromotionFilters(
  columnFilters: Record<string, ColumnFilter>,
  period: PeriodRange,
  trackingOnly: boolean,
): PromotionSearchFilters {
  const status = enumFilter(columnFilters.status);
  return {
    name: stringFilter(columnFilters.name),
    description: stringFilter(columnFilters.description),
    type: enumFilter(columnFilters.type),
    applyTo: enumFilter(columnFilters.applyTo),
    // Lọc cột trạng thái do người dùng đặt luôn thắng chip mặc định.
    status: status ?? (trackingOnly ? { value: PromotionStatus.TRACKING } : undefined),
    startDate: dateRange(columnFilters.startDate) ?? {
      from: period.from,
      to: period.to,
    },
    endDate: dateRange(columnFilters.endDate),
  };
}

export interface FilterChip {
  id: string;
  label: string;
}

const COLUMN_CHIP_LABELS: Record<string, string> = {
  name: "Tên chương trình",
  description: "Mô tả",
  type: "Hình thức",
  applyTo: "Áp dụng cho",
  status: "Trạng thái",
  startDate: "Ngày bắt đầu",
  endDate: "Ngày kết thúc",
};

const ENUM_CHIP_VALUE_LABELS: Record<string, Record<string, string>> = {
  type: PROMOTION_TYPE_LABELS_VI,
  status: PROMOTION_STATUS_LABELS_VI,
  applyTo: PROMOTION_APPLY_TO_LABELS_VI,
};

/** Danh sách chip cho các bộ lọc đang bật — mỗi chip xóa được bằng một click. */
export function buildFilterChips(
  columnFilters: Record<string, ColumnFilter>,
  trackingOnly: boolean,
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (trackingOnly && !columnFilters.status?.value) {
    chips.push({ id: "trackingOnly", label: "Trạng thái: Đang theo dõi" });
  }

  for (const [key, filter] of Object.entries(columnFilters)) {
    const shown = filter?.value || filter?.from || filter?.to;
    if (!shown) continue;
    const column = COLUMN_CHIP_LABELS[key] ?? key;
    const value = filter.value
      ? (ENUM_CHIP_VALUE_LABELS[key]?.[filter.value] ?? filter.value)
      : [filter.from, filter.to].filter(Boolean).join(" → ");
    chips.push({ id: key, label: `${column}: ${value}` });
  }

  return chips;
}
