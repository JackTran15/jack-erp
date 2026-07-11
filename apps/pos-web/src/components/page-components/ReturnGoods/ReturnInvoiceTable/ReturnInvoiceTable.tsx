import { useMemo } from "react";
import { formatVnd } from "@erp/ui";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import { ReturnInvoiceColumnKey } from "@erp/pos/constants/return-goods.constant";
import { sumInvoiceTotals } from "@erp/pos/lib/page-libs/return-goods/returnGoodsMath";
import type { ReturnInvoiceFilters } from "@erp/pos/dtos/return-goods.dto";
import type { ReturnInvoiceRow } from "@erp/pos/interfaces/return-goods.interface";

export interface ReturnInvoiceTableProps {
  rows: ReadonlyArray<ReturnInvoiceRow>;
  filters: ReturnInvoiceFilters;
  onFilterChange: (key: keyof ReturnInvoiceFilters, value: string) => void;
  onReturn: (row: ReturnInvoiceRow) => void;
  /** Mở biên lai chi tiết hóa đơn khi bấm vào số hóa đơn. */
  onOpenInvoice: (row: ReturnInvoiceRow) => void;
}

/**
 * Outer invoice list for the return-goods page. Wraps the shared
 * `<PosDataTable />` with column defs, per-column filter cells and a
 * "Tổng tiền" summary row.
 */
export function ReturnInvoiceTable({
  rows,
  filters,
  onFilterChange,
  onReturn,
  onOpenInvoice,
}: ReturnInvoiceTableProps) {
  const columns = useMemo<ReadonlyArray<PosDataTableColumn<ReturnInvoiceRow>>>(
    () => [
      {
        key: ReturnInvoiceColumnKey.InvoiceNumber,
        title: "Số hóa đơn",
        render: (row) => (
          <button
            type="button"
            onClick={() => onOpenInvoice(row)}
            className="font-medium text-[#5C6BC0] transition-colors hover:text-[#4338CA] focus:outline-none focus-visible:underline"
          >
            {row.invoiceNumber}
          </button>
        ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.invoiceNumber}
            onChange={(next) => onFilterChange("invoiceNumber", next)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.CreatedAt,
        title: "Ngày tạo",
        render: (row) => formatViDateTime(row.createdAt),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.createdAt}
            onChange={(next) => onFilterChange("createdAt", next)}
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.CustomerName,
        title: "Khách hàng",
        render: (row) => row.customerName || "",
        filterRender: (
          <PosDataTableFilterCell
            value={filters.customerName}
            onChange={(next) => onFilterChange("customerName", next)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.CustomerPhone,
        title: "Số điện thoại",
        render: (row) => row.customerPhone || "",
        filterRender: (
          <PosDataTableFilterCell
            value={filters.customerPhone}
            onChange={(next) => onFilterChange("customerPhone", next)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.TotalAmount,
        title: "Tổng thanh toán",
        align: "right",
        render: (row) => formatVnd(row.totalAmount),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.totalAmount}
            onChange={(next) => onFilterChange("totalAmount", next)}
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
            align="right"
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.BranchName,
        title: "Chi nhánh",
        render: (row) => row.branchName,
        filterRender: (
          <PosDataTableFilterCell
            value={filters.branchName}
            onChange={(next) => onFilterChange("branchName", next)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: ReturnInvoiceColumnKey.Action,
        title: "",
        align: "right",
        headerClassName: "w-[120px]",
        cellClassName: "w-[120px]",
        render: (row) => (
          <button
            type="button"
            onClick={() => onReturn(row)}
            className="inline-flex h-8 items-center justify-center rounded-md bg-[#5C6BC0] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4F46E5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2"
          >
            Đổi trả
          </button>
        ),
      },
    ],
    [filters, onFilterChange, onReturn, onOpenInvoice],
  );

  const grandTotal = sumInvoiceTotals(rows);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <PosDataTable<ReturnInvoiceRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.id}
          emptyText="Chưa có hóa đơn nào."
          hasBorder={false}
          fillHeight
          summaryRow={
            <tr className="h-11 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
              <td colSpan={4} className="px-3">
                Tổng tiền:
              </td>
              <td className="px-3 text-right tabular-nums">
                {formatVnd(grandTotal)}
              </td>
              <td className="px-3" />
              <td className="w-[120px] px-3" />
            </tr>
          }
        />
      </div>
    </div>
  );
}
