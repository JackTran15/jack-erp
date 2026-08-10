import { PromotionStatus } from "@erp/shared-interfaces";
import type { ColumnFilter, ColumnFilterMode } from "../../../components/table/pagination.dto";
import type { StringFilter } from "../api/use-promotions";
import type { VoucherSearchFilters } from "../api/use-vouchers";
import { PROMOTION_STATUS_LABELS_VI } from "../programs/programs.constants";
import type { FilterChip } from "../programs/programs-filter";

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

function dateRange(filter?: ColumnFilter) {
  if (!filter?.from && !filter?.to) return undefined;
  return { from: filter.from, to: filter.to };
}

/**
 * Body của `POST /v2/vouchers/search`.
 *
 * Giống màn CTKM: API **không** tự lọc `status`. Mặc định hiện là "Tất cả"
 * (FR-004 đảo ngược 2026-08-10, T-06-06) — `trackingOnly` không còn được
 * truyền `true` từ `VouchersPage.tsx`, tham số này vẫn còn vì cột lọc trạng
 * thái do người dùng tự đặt vẫn cần thắng nó.
 *
 * `faceValue` dùng `CompareFilterDto` — ô lọc của cột số nhập một con số và ngầm
 * hiểu là "≤", nên map sang toán tử `<=` thay vì `=`.
 */
export function buildVoucherFilters(
  columnFilters: Record<string, ColumnFilter>,
  trackingOnly: boolean,
): VoucherSearchFilters {
  const status = columnFilters.status?.value
    ? { value: columnFilters.status.value }
    : undefined;

  const faceValueRaw = columnFilters.faceValue?.value;
  const faceValue = faceValueRaw && !Number.isNaN(Number(faceValueRaw))
    ? ({ operator: "<=", value: Number(faceValueRaw) } as const)
    : undefined;

  return {
    issuer: stringFilter(columnFilters.issuer),
    code: stringFilter(columnFilters.code),
    description: stringFilter(columnFilters.description),
    startDate: dateRange(columnFilters.startDate),
    endDate: dateRange(columnFilters.endDate),
    status: status ?? (trackingOnly ? { value: PromotionStatus.TRACKING } : undefined),
    faceValue,
  };
}

const COLUMN_CHIP_LABELS: Record<string, string> = {
  issuer: "Nhà phát hành",
  code: "Voucher",
  description: "Mô tả",
  status: "Trạng thái",
  startDate: "Ngày bắt đầu",
  endDate: "Ngày kết thúc",
  faceValue: "Mệnh giá ≤",
};

export function buildVoucherChips(
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
      ? key === "status"
        ? (PROMOTION_STATUS_LABELS_VI[
            filter.value as PromotionStatus
          ] ?? filter.value)
        : filter.value
      : [filter.from, filter.to].filter(Boolean).join(" → ");
    chips.push({ id: key, label: `${column}: ${value}` });
  }

  return chips;
}
