import { useMemo } from "react";
import { Badge } from "@erp/ui";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import type {
  ColumnFilter,
  ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { PromotionStatus } from "@erp/shared-interfaces";
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_OPTIONS,
} from "../vouchers.constants";
import type {
  VoucherSearchResponse,
  VoucherSummaryRow,
} from "../../api/use-vouchers";

interface Props {
  rows: VoucherSummaryRow[];
  loading: boolean;
  /** Tổng của **toàn tập kết quả lọc**, do server tính — không phải tổng trang hiện tại. */
  summary?: VoucherSearchResponse["summary"];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleRow: (id: string) => void;
  onOpenVoucher: (row: VoucherSummaryRow) => void;
  columnFilters: Record<string, ColumnFilter>;
  onFilterModeChange: (key: string, mode: ColumnFilterMode) => void;
  onFilterValueChange: (key: string, value: string) => void;
}

const numberFormatter = new Intl.NumberFormat("vi-VN");

/** dd/MM/yyyy từ chuỗi ISO yyyy-MM-dd. */
function formatDateVi(iso?: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

const STATUS_BADGE_VARIANT: Record<PromotionStatus, "default" | "secondary"> = {
  [PromotionStatus.TRACKING]: "default",
  [PromotionStatus.STOPPED]: "secondary",
};

const NUMERIC_CELL_CLASS = "text-right tabular-nums";

export function VouchersTable({
  rows,
  loading,
  summary,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleRow,
  onOpenVoucher,
  columnFilters,
  onFilterModeChange,
  onFilterValueChange,
}: Props) {
  const columns = useMemo<TableColumn<VoucherSummaryRow>[]>(
    () => [
      {
        key: "issuer",
        label: "Nhà phát hành",
        width: 180,
        sortable: true,
        filterKind: "symbol",
        render: (row) => row.issuer,
      },
      {
        key: "code",
        label: "Voucher",
        width: 160,
        sortable: true,
        filterKind: "symbol",
        render: (row) => (
          <button
            type="button"
            className="text-left font-medium text-primary-blue hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onOpenVoucher(row);
            }}
          >
            {row.code}
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
        key: "description",
        label: "Mô tả",
        width: 220,
        filterKind: "symbol",
        render: (row) => row.description ?? "",
      },
      {
        key: "faceValue",
        label: "Mệnh giá",
        width: 140,
        sortable: true,
        filterKind: "number-range",
        className: NUMERIC_CELL_CLASS,
        render: (row) => numberFormatter.format(row.faceValue),
      },
      {
        key: "totalQuantity",
        label: "Tổng số lượng",
        width: 140,
        sortable: true,
        filterKind: "number-range",
        className: NUMERIC_CELL_CLASS,
        render: (row) => numberFormatter.format(row.totalQuantity),
        // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
        footer: summary ? numberFormatter.format(summary.totalQuantity) : null,
      },
      {
        key: "totalVoucherValue",
        label: "Tổng giá trị voucher",
        width: 180,
        sortable: true,
        filterKind: "number-range",
        className: NUMERIC_CELL_CLASS,
        render: (row) => numberFormatter.format(row.totalVoucherValue),
        // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
        footer: summary ? numberFormatter.format(summary.totalVoucherValue) : null,
      },
      {
        key: "totalAppliedValue",
        label: "Tổng giá trị áp dụng",
        width: 180,
        sortable: true,
        filterKind: "number-range",
        className: NUMERIC_CELL_CLASS,
        render: (row) => numberFormatter.format(row.totalAppliedValue),
        // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
        footer: summary ? numberFormatter.format(summary.totalAppliedValue) : null,
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 160,
        filterKind: "select",
        filterOptions: VOUCHER_STATUS_OPTIONS,
        render: (row) => (
          <Badge variant={STATUS_BADGE_VARIANT[row.status]}>
            {VOUCHER_STATUS_LABELS[row.status]}
          </Badge>
        ),
      },
    ],
    [onOpenVoucher, summary],
  );

  return (
    <BaseDataTable
      columns={columns}
      rows={rows}
      loading={loading}
      emptyLabel="Không có dữ liệu."
      getRowKey={(row) => row.id}
      onRowClick={(row) => onToggleRow(row.id)}
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
              aria-label={`Chọn ${row.code}`}
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
