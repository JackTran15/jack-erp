import { useMemo, useState } from "react";
import { formatVnd } from "@erp/ui";
import {
  CustomerDetailDataTable,
  type CustomerDetailTableColumn,
} from "./CustomerDetailDataTable";
import {
  PurchaseHistoryStatusEnum,
  PurchaseHistoryStatusFilterEnum,
} from "../../../constants/customer";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "../../../constants/filterOperator";
import { PosSelect } from "../../common/forms/PosSelect";
import { PaginationBar } from "./PaginationBar";
import { CustomerDetailFilterInput } from "./CustomerDetailFilterInput";
import { StatusBadge } from "./StatusBadge";
import { formatViDateTime } from "../../../../../lib/dateTime";
import type { PurchaseHistoryEntry } from "./types";

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

  const filtered = useMemo(
    () =>
      selectedStatus === null
        ? rows
        : rows.filter((r) => r.status === selectedStatus),
    [rows, selectedStatus],
  );

  const grandTotal = filtered.reduce((s, r) => s + r.totalAmount, 0);
  const columns = useMemo<
    ReadonlyArray<CustomerDetailTableColumn<PurchaseHistoryEntry>>
  >(
    () => [
      {
        key: "invoiceDate",
        title: "Ngày hóa đơn",
        render: (row) => formatViDateTime(row.invoiceDate),
        filterRender: (
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: PurchaseHistoryStatusFilterEnum.ALL, label: "Tất cả" },
              {
                value: PurchaseHistoryStatusFilterEnum.PAID,
                label: "Đã thanh toán",
              },
              { value: PurchaseHistoryStatusFilterEnum.DEBT, label: "Ghi nợ" },
            ]}
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
          <CustomerDetailFilterInput
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
          <CustomerDetailFilterInput
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
        <CustomerDetailDataTable
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
      <PaginationBar
        page={1}
        totalPages={1}
        pageSize={100}
        total={filtered.length}
      />
    </div>
  );
}
