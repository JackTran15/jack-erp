import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  StorageReportShell,
  resolveLabel,
  buildApiFilters,
  toColumnFilterPayload,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
import { StatusBadge } from "../../../components/status/StatusBadge";
import {
  listTemporaryWarehouseOutGoods,
  type InventoryReportFilters,
  type TempWarehouseIssueRow,
} from "../../../api/inventory-reports";

const GROUP_OPTIONS = [
  { value: "__all__", label: "Tất cả nhóm" },
  { value: "Giày nam", label: "Giày nam" },
  { value: "Giày nữ", label: "Giày nữ" },
  { value: "Sandal nữ", label: "Sandal nữ" },
  { value: "Dép nữ", label: "Dép nữ" },
];
const SHIFT_OPTIONS = [
  { value: "__all__", label: "Tất cả" },
  { value: "morning", label: "Ca sáng" },
  { value: "afternoon", label: "Ca chiều" },
];
/** Các cột phải lọc theo giá trị số, không phải theo chuỗi đã định dạng. */
const NUMERIC_COLUMNS = new Set([
  "outQty",
  "returnQty",
  "saleQty",
  "remainingQty",
]);

const STATUS_OPTIONS = [
  { value: "Bán hàng trưng bày", label: "Bán hàng trưng bày" },
  { value: "Trả hàng trưng bày", label: "Trả hàng trưng bày" },
  { value: "Xuất không bán", label: "Xuất không bán" },
];

export function TemporaryIssuesReportPage() {
  const filterFields: FilterField[] = [
    {
      key: "group",
      label: "Nhóm hàng hóa",
      type: "select",
      options: GROUP_OPTIONS,
    },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
    {
      key: "shift",
      label: "Ca làm việc",
      type: "select",
      options: SHIFT_OPTIONS,
    },
  ];

  const num = "text-right tabular-nums";
  const columns: TableColumn<TempWarehouseIssueRow>[] = [
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "unit", label: "Đơn vị tính", width: 100, render: (r) => r.unit },
    {
      key: "location",
      label: "Mã vị trí",
      width: 120,
      render: (r) => r.location,
    },
    {
      key: "date",
      label: "Ngày xuất",
      width: 130,
      render: (r) => r.date,
      filterKind: "date",
    },
    {
      key: "time",
      label: "Giờ xuất",
      width: 120,
      render: (r) => r.time,
      filterKind: "time",
    },
    {
      key: "staff",
      label: "Nhân viên xuất",
      width: 160,
      render: (r) => r.staff,
    },
    {
      key: "outQty",
      label: "SL xuất",
      width: 90,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.outQty,
    },
    {
      key: "returnQty",
      label: "SL trả",
      width: 90,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.returnQty,
    },
    {
      key: "saleQty",
      label: "SL bán",
      width: 90,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.saleQty,
    },
    {
      key: "remainingQty",
      label: "SL tồn",
      width: 90,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.remainingQty,
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 170,
      render: (r) => <StatusBadge variant="neutral">{r.status}</StatusBadge>,
      filterKind: "select",
      filterOptions: STATUS_OPTIONS,
    },
    {
      key: "invoice",
      label: "Hóa đơn bán",
      width: 130,
      render: (r) =>
        r.invoice ? <span className="text-primary">{r.invoice}</span> : "",
    },
  ];

  // Server-paged: page, page size and column filters all travel to the API, so
  // the grid and the footer describe the same set no matter how deep the user
  // pages. `pageSize` is the real page now, not the old 200-row truncation.
  const [apiFilters, setApiFilters] = useState<InventoryReportFilters>({
    preset: "this_month",
    page: 1,
    pageSize: DEFAULT_PAGINATION.pageSize,
  });

  const query = useQuery({
    queryKey: ["temp-warehouse-out-goods", apiFilters],
    queryFn: () => listTemporaryWarehouseOutGoods(apiFilters),
  });

  const rows = query.data?.data ?? [];

  return (
    <StorageReportShell<TempWarehouseIssueRow>
      title="Hàng hóa xuất kho tạm"
      storageKey="reports/storage/temporary-issues"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        {
          label: "Nhóm hàng hóa",
          value: resolveLabel(filterFields[0]!, values),
        },
        { label: "Ca làm việc", value: resolveLabel(filterFields[2]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={query.isFetching}
      total={query.data?.total ?? 0}
      totals={query.data?.totals}
      onApply={(values, period) =>
        setApiFilters((prev) => ({
          ...buildApiFilters(values, period, { categoryFieldKey: "group" }),
          // buildApiFilters still hands back the client-mode page size; this
          // report pages on the server, so keep our own and restart at page 1.
          page: 1,
          pageSize: prev.pageSize,
          columnFilters: prev.columnFilters,
        }))
      }
      onQueryChange={({ page, pageSize, columnFilters }) =>
        setApiFilters((prev) => ({
          ...prev,
          page,
          pageSize,
          columnFilters: toColumnFilterPayload(columnFilters, NUMERIC_COLUMNS),
        }))
      }
      emptyLabel="Không có dữ liệu xuất kho tạm."
      getRowKey={(r, i) => `${r.sku}-${r.date}-${r.time}-${i}`}
      // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
      columnSummary={(_rows, totals) => ({
        outQty: totals?.outQty ?? 0,
        returnQty: totals?.returnQty ?? 0,
        saleQty: totals?.saleQty ?? 0,
        remainingQty: totals?.remainingQty ?? 0,
      })}
    />
  );
}
