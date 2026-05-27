import { useMemo } from "react";
import { formatVnd } from "@erp/ui";

import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { InvoiceStatusBadge } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/InvoiceReceiptDialog/InvoiceStatusBadge/InvoiceStatusBadge";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  INVOICE_LIST_COLUMN_LABELS,
  INVOICE_LIST_COLUMN_ORDER,
  InvoiceListColumnKey,
} from "@erp/pos/constants/invoice-list.constant";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import type { InvoiceListFilters } from "@erp/pos/hooks/page-hooks/invoice-list/use-invoice-list";
import type { InvoiceListRow } from "@erp/pos/interfaces/invoice.interface";
import type { InvoiceStatus } from "@erp/pos/types/invoice.type";

export interface InvoiceListTableProps {
  rows: ReadonlyArray<InvoiceListRow>;
  filters: InvoiceListFilters;
  visibleColumns: ReadonlySet<InvoiceListColumnKey>;
  grandTotal: number;
  onFilterChange: (key: keyof InvoiceListFilters, value: string) => void;
  onOpenInvoice: (row: InvoiceListRow) => void;
}

interface StatusOption {
  value: "" | InvoiceStatus;
  label: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "", label: "Tất cả" },
  { value: "paid", label: "Đã thanh toán" },
  { value: "debt", label: "Ghi nợ" },
  { value: "partial_debt", label: "Nợ một phần" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "cancelled", label: "Đã hủy" },
];

function dateCell(value: string | null): string {
  return value ? formatViDateTime(value) : "";
}

/**
 * Bảng "Danh sách hóa đơn" — `PosDataTable` + filter từng cột + badge trạng
 * thái + dòng tổng. Chỉ render cột thuộc `visibleColumns`. Click số hóa đơn gọi
 * `onOpenInvoice` (mở biên lai chi tiết).
 */
export function InvoiceListTable({
  rows,
  filters,
  visibleColumns,
  grandTotal,
  onFilterChange,
  onOpenInvoice,
}: InvoiceListTableProps) {
  const allColumns = useMemo<
    Record<InvoiceListColumnKey, PosDataTableColumn<InvoiceListRow>>
  >(() => {
    const textFilter = (key: keyof InvoiceListFilters) => (
      <PosDataTableFilterCell
        value={filters[key]}
        onChange={(next) => onFilterChange(key, next)}
        operatorType={FilterOperatorTypeEnum.TEXT}
        leadingOperator={FilterOperatorEnum.CONTAINS}
      />
    );

    return {
      [InvoiceListColumnKey.Code]: {
        key: InvoiceListColumnKey.Code,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.Code],
        render: (row) => (
          <button
            type="button"
            onClick={() => onOpenInvoice(row)}
            className="font-medium text-[#5C6BC0] transition-colors hover:text-[#4338CA] hover:underline"
          >
            {row.code}
          </button>
        ),
        filterRender: textFilter("code"),
      },
      [InvoiceListColumnKey.IssuedAt]: {
        key: InvoiceListColumnKey.IssuedAt,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.IssuedAt],
        render: (row) => dateCell(row.issuedAt),
      },
      [InvoiceListColumnKey.CreatedAt]: {
        key: InvoiceListColumnKey.CreatedAt,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.CreatedAt],
        render: (row) => dateCell(row.createdAt),
      },
      [InvoiceListColumnKey.Status]: {
        key: InvoiceListColumnKey.Status,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.Status],
        render: (row) => <InvoiceStatusBadge status={row.status} />,
        filterRender: (
          <PosSelect<StatusOption>
            value={
              STATUS_OPTIONS.find((o) => o.value === filters.status) ?? null
            }
            onChange={(item) => onFilterChange("status", item.value)}
            items={STATUS_OPTIONS}
            itemKey={(o) => o.value || "all"}
            renderItem={(o) => o.label}
            variant="underline"
          />
        ),
      },
      [InvoiceListColumnKey.CustomerCode]: {
        key: InvoiceListColumnKey.CustomerCode,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.CustomerCode],
        render: (row) => row.customerCode,
        filterRender: textFilter("customerCode"),
      },
      [InvoiceListColumnKey.CustomerName]: {
        key: InvoiceListColumnKey.CustomerName,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.CustomerName],
        render: (row) => row.customerName,
        filterRender: textFilter("customerName"),
      },
      [InvoiceListColumnKey.CustomerPhone]: {
        key: InvoiceListColumnKey.CustomerPhone,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.CustomerPhone],
        render: (row) => row.customerPhone,
        filterRender: textFilter("customerPhone"),
      },
      [InvoiceListColumnKey.Amount]: {
        key: InvoiceListColumnKey.Amount,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.Amount],
        align: "right",
        render: (row) => formatVnd(row.amount),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.amount}
            onChange={(next) => onFilterChange("amount", next)}
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
            align="right"
          />
        ),
      },
      [InvoiceListColumnKey.Note]: {
        key: InvoiceListColumnKey.Note,
        title: INVOICE_LIST_COLUMN_LABELS[InvoiceListColumnKey.Note],
        render: (row) => row.note,
        filterRender: textFilter("note"),
      },
    };
  }, [filters, onFilterChange, onOpenInvoice]);

  const columns = useMemo(
    () =>
      INVOICE_LIST_COLUMN_ORDER.filter((key) => visibleColumns.has(key)).map(
        (key) => allColumns[key],
      ),
    [allColumns, visibleColumns],
  );

  const amountIdx = columns.findIndex(
    (c) => c.key === InvoiceListColumnKey.Amount,
  );
  const summaryRow =
    amountIdx >= 0 ? (
      <tr className="h-11 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
        <td colSpan={Math.max(1, amountIdx)} className="px-3">
          Tổng tiền:
        </td>
        <td className="px-3 text-right tabular-nums">{formatVnd(grandTotal)}</td>
        {columns.slice(amountIdx + 1).map((c) => (
          <td key={c.key} className="px-3" />
        ))}
      </tr>
    ) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <PosDataTable<InvoiceListRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.id}
          emptyText="Chưa có hóa đơn nào."
          hasBorder={false}
          fillHeight
          summaryRow={summaryRow}
        />
      </div>
    </div>
  );
}
