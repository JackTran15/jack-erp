import { useMemo } from "react";
import { Badge } from "@erp/ui";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import type {
  ColumnFilter,
  ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import {
  PROMOTION_APPLY_TO_LABELS,
  PROMOTION_APPLY_TO_OPTIONS,
  PROMOTION_FORM_LABELS,
  PROMOTION_FORM_OPTIONS,
  PROMOTION_STATUS_LABELS,
  PROMOTION_STATUS_OPTIONS,
} from "../programs.constants";
import type { PromotionProgramRow, PromotionStatus } from "../programs.types";

interface Props {
  rows: PromotionProgramRow[];
  loading: boolean;
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleRow: (id: string) => void;
  onOpenProgram: (row: PromotionProgramRow) => void;
  columnFilters: Record<string, ColumnFilter>;
  onFilterModeChange: (key: string, mode: ColumnFilterMode) => void;
  onFilterValueChange: (key: string, value: string) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort: (key: string) => void;
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
  TRACKING: "default",
  PAUSED: "secondary",
  ENDED: "outline",
};

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
  const columns = useMemo<TableColumn<PromotionProgramRow>[]>(
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
        filterOptions: PROMOTION_APPLY_TO_OPTIONS,
        render: (row) => PROMOTION_APPLY_TO_LABELS[row.applyTo],
      },
      {
        key: "form",
        label: "Hình thức khuyến mại",
        width: 190,
        filterKind: "select",
        filterOptions: PROMOTION_FORM_OPTIONS,
        render: (row) => PROMOTION_FORM_LABELS[row.form],
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
        filterOptions: PROMOTION_STATUS_OPTIONS,
        render: (row) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.status]}>
            {PROMOTION_STATUS_LABELS[row.status]}
          </Badge>
        ),
      },
    ],
    [onOpenProgram],
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
