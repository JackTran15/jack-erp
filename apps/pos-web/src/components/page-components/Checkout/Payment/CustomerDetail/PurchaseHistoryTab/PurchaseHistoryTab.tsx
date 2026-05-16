import { useMemo, useState } from "react";
import { formatVnd } from "@erp/ui";
import { PosDataTable, type PosDataTableColumn } from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import {
  PurchaseHistoryStatusEnum,
  PurchaseHistoryStatusFilterEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { StatusBadge } from "@erp/pos/components/page-components/Checkout/Payment/CustomerDetail/StatusBadge/StatusBadge";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import type { PurchaseHistoryEntry } from "@erp/pos/lib/page-libs/checkout/customerDetail.types";

export interface PurchaseHistoryTabProps {
  rows: PurchaseHistoryEntry[];
}

const STATUS_FILTER_TO_STATUS: Record<
  PurchaseHistoryStatusFilterEnum,
  PurchaseHistoryStatusEnum | null
> = {
  [PurchaseHistoryStatusFilterEnum.ALL]: null,
  [PurchaseHistoryStatusFilterEnum.PAID]: PurchaseHistoryStatusEnum.PAID,
  [PurchaseHistoryStatusFilterEnum.DEBT]: PurchaseHistoryStatusEnum.DEBT,
};

/**
 * "Lịch sử mua hàng" tab — data table with header + filter row + body +
 * pagination + grand-total footer. Filters are visual placeholders for now;
 * wire `onFilterChange` once a real query layer exists.
 */
export function PurchaseHistoryTab({ rows }: PurchaseHistoryTabProps) {
  const [statusFilter, setStatusFilter] =
    useState<PurchaseHistoryStatusFilterEnum>(
      PurchaseHistoryStatusFilterEnum.ALL,
    );
  const selectedStatus = STATUS_FILTER_TO_STATUS[statusFilter];

  const statusOptions = useMemo(
    () => [
      { value: PurchaseHistoryStatusFilterEnum.ALL, label: "Tất cả" },
      {
        value: PurchaseHistoryStatusFilterEnum.PAID,
        label: "Đã thanh toán",
      },
      { value: PurchaseHistoryStatusFilterEnum.DEBT, label: "Ghi nợ" },
    ],
    [],
  );

  const filtered = useMemo(
    () =>
      selectedStatus === null
        ? rows
        : rows.filter((r) => r.status === selectedStatus),
    [rows, selectedStatus],
  );

  const grandTotal = filtered.reduce((s, r) => s + r.totalAmount, 0);
  const columns = useMemo<
    ReadonlyArray<PosDataTableColumn<PurchaseHistoryEntry>>
  >(
    () => [
      {
        key: "invoiceDate",
        title: "Ngày hóa đơn",
        render: (row) => formatViDateTime(row.invoiceDate),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: "invoiceNumber",
        title: "Số hóa đơn",
        render: (row) => (
          <span className="font-medium text-[#5C6BC0]">
            {row.invoiceNumber}
          </span>
        ),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "storeName",
        title: "Tên cửa hàng",
        render: (row) => row.storeName || "—",
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.EQUALS}
          />
        ),
      },
      {
        key: "status",
        title: "Trạng thái",
        render: (row) => <StatusBadge status={row.status} />,
        filterRender: (
          <PosSelect
            value={
              statusOptions.find((o) => o.value === statusFilter) ?? null
            }
            onChange={(item) => setStatusFilter(item.value)}
            items={statusOptions}
            itemKey={(o) => o.value}
            renderItem={(o) => o.label}
            variant="underline"
            className="min-w-[130px]"
          />
        ),
      },
      {
        key: "totalAmount",
        title: "Tổng thanh toán",
        align: "right",
        render: (row) => formatVnd(row.totalAmount),
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            align="right"
            operatorType={FilterOperatorTypeEnum.NUMBER}
            leadingOperator={FilterOperatorEnum.LESS_THAN_OR_EQUAL}
          />
        ),
      },
      {
        key: "note",
        title: "Ghi chú",
        render: (row) => row.note ?? "",
        filterRender: (
          <PosDataTableFilterCell
            placeholder=""
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
    ],
    [statusFilter],
  );

  return (
    <div className="flex flex-col">
      <div className="max-h-[360px] overflow-auto border border-gray-200">
        <PosDataTable
          columns={columns}
          dataSource={filtered}
          rowKey={(row) => row.id}
          emptyText="Chưa có hóa đơn nào."
          summaryRow={
            filtered.length > 0 ? (
              <tr className="h-10 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
                <td colSpan={4} className="px-3">
                  Tổng hóa đơn: {filtered.length}
                </td>
                <td className="px-3 text-right">{formatVnd(grandTotal)}</td>
                <td />
              </tr>
            ) : null
          }
        />
      </div>
      <PosPaginationBar
        page={1}
        totalPages={1}
        pageSize={100}
        total={filtered.length}
      />
    </div>
  );
}
