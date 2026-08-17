import { useMemo } from "react";
import { Badge } from "@erp/ui";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import type {
  ColumnFilter,
  ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { PromotionStatus } from "@erp/shared-interfaces";
import type { PromotionProgramSummary } from "@erp/shared-interfaces";
import {
  PROMOTION_APPLY_TO_FILTER_OPTIONS,
  PROMOTION_APPLY_TO_LABELS_VI,
  PROMOTION_STATUS_FILTER_OPTIONS,
  PROMOTION_STATUS_LABELS_VI,
  PROMOTION_TYPE_FILTER_OPTIONS,
  PROMOTION_TYPE_LABELS_VI,
} from "../programs.constants";

interface Props {
  rows: PromotionProgramSummary[];
  loading: boolean;
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleRow: (id: string) => void;
  onOpenProgram: (row: PromotionProgramSummary) => void;
  columnFilters: Record<string, ColumnFilter>;
  onFilterModeChange: (key: string, mode: ColumnFilterMode) => void;
  onFilterValueChange: (key: string, value: string) => void;
  /**
   * Sắp xếp theo cột: API `POST /v2/promotions/search` **không** nhận tham số
   * sort — nó luôn trả `priority ASC, createdAt DESC`, vì `priority` chính là
   * thứ tự áp dụng thật (BR-001) và người dùng cần thấy đúng thứ tự đó. Sắp xếp
   * trong RAM sẽ chỉ sắp đúng trang hiện tại, nên bỏ hẳn thay vì làm nửa vời.
   */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
}

/** dd/MM/yyyy từ chuỗi ISO yyyy-MM-dd. */
function formatDateVi(iso?: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

const STATUS_BADGE_VARIANT: Record<
  PromotionStatus,
  "default" | "secondary" | "outline"
> = {
  [PromotionStatus.TRACKING]: "default",
  [PromotionStatus.STOPPED]: "secondary",
};

/**
 * "Đã kết thúc" là trạng thái **suy ra ở client**, không phải giá trị lưu:
 * chương trình vẫn `TRACKING` nhưng đã qua ngày kết thúc. Xem `docs/26-promotion-design.md`
 * §10.1 — pg enum chỉ có 2 giá trị, khớp radio FR-010.
 */
function statusLabel(row: PromotionProgramSummary, today: string): string {
  if (
    row.status === PromotionStatus.TRACKING &&
    row.endDate &&
    row.endDate < today
  ) {
    return "Đã kết thúc";
  }
  return PROMOTION_STATUS_LABELS_VI[row.status];
}

export function ProgramsTable({
  rows,
  loading,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleRow,
  onOpenProgram,
  columnFilters,
  onFilterModeChange,
  onFilterValueChange,
  sortBy,
  sortOrder,
  onSort,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const columns = useMemo<TableColumn<PromotionProgramSummary>[]>(
    () => [
      {
        key: "name",
        label: "Chương trình khuyến mại",
        width: 220,
        sortable: true,
        filterKind: "symbol",
        render: (row) => (
          <button
            type="button"
            className="text-left font-medium text-primary-blue hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onOpenProgram(row);
            }}
          >
            {row.name}
          </button>
        ),
      },
      {
        key: "startDate",
        label: "Ngày bắt đầu",
        width: 140,
        sortable: true,
        filterKind: "date",
        render: (row) => formatDateVi(row.startDate),
      },
      {
        key: "endDate",
        label: "Ngày kết thúc",
        width: 140,
        sortable: true,
        filterKind: "date",
        render: (row) => formatDateVi(row.endDate),
      },
      {
        key: "applyTo",
        label: "Áp dụng cho",
        width: 180,
        filterKind: "select",
        filterOptions: PROMOTION_APPLY_TO_FILTER_OPTIONS,
        render: (row) => PROMOTION_APPLY_TO_LABELS_VI[row.applyTo],
      },
      {
        key: "type",
        label: "Hình thức khuyến mại",
        width: 190,
        filterKind: "select",
        filterOptions: PROMOTION_TYPE_FILTER_OPTIONS,
        render: (row) => PROMOTION_TYPE_LABELS_VI[row.type],
      },
      {
        key: "description",
        label: "Mô tả",
        width: 240,
        filterKind: "symbol",
        render: (row) => row.description ?? "",
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 150,
        filterKind: "select",
        filterOptions: PROMOTION_STATUS_FILTER_OPTIONS,
        render: (row) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.status]}>
            {statusLabel(row, today)}
          </Badge>
        ),
      },
    ],
    [onOpenProgram, today],
  );

  return (
    <BaseDataTable
      columns={columns}
      rows={rows}
      loading={loading}
      emptyLabel="Không có chương trình khuyến mãi."
      getRowKey={(row) => row.id}
      onRowClick={(row) => onToggleRow(row.id)}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      columnFilterControl={{
        filters: columnFilters,
        onModeChange: onFilterModeChange,
        onValueChange: onFilterValueChange,
      }}
      leadingColumn={{
        width: 40,
        header: (
          <input
            type="checkbox"
            aria-label="Chọn tất cả"
            checked={allSelected}
            onChange={(event) => onToggleAll(event.target.checked)}
          />
        ),
        cell: (row) => (
          <div onClick={(event) => event.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Chọn ${row.name}`}
              checked={selectedIds.has(row.id)}
              onChange={() => onToggleRow(row.id)}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ),
      }}
    />
  );
}
