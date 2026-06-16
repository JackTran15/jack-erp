import { useMemo } from "react";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import {
  TEMPORARY_ISSUES_MOCK_ROWS,
  type TempIssueRow,
} from "./_shared/temporary-issues.mock";

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
const STATUS_OPTIONS = [
  { value: "Bán hàng trưng bày", label: "Bán hàng trưng bày" },
  { value: "Trả hàng trưng bày", label: "Trả hàng trưng bày" },
  { value: "Xuất không bán", label: "Xuất không bán" },
];

export function TemporaryIssuesReportPage() {
  const filterFields: FilterField[] = [
    { key: "group", label: "Nhóm hàng hóa", type: "select", options: GROUP_OPTIONS },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
    { key: "shift", label: "Ca làm việc", type: "select", options: SHIFT_OPTIONS },
  ];

  const num = "text-right tabular-nums";
  const columns: TableColumn<TempIssueRow>[] = [
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "unit", label: "Đơn vị tính", width: 100, render: (r) => r.unit },
    { key: "location", label: "Mã vị trí", width: 120, render: (r) => r.location },
    { key: "date", label: "Ngày xuất", width: 130, render: (r) => r.date, filterKind: "date" },
    { key: "time", label: "Giờ xuất", width: 120, render: (r) => r.time, filterKind: "time" },
    { key: "staff", label: "Nhân viên xuất", width: 160, render: (r) => r.staff },
    { key: "outQty", label: "SL xuất", width: 90, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "returnQty", label: "SL trả", width: 90, headerClassName: "text-right", className: num, render: (r) => r.returnQty },
    { key: "saleQty", label: "SL bán", width: 90, headerClassName: "text-right", className: num, render: (r) => r.saleQty },
    { key: "remainingQty", label: "SL tồn", width: 90, headerClassName: "text-right", className: num, render: (r) => r.remainingQty },
    {
      key: "status",
      label: "Trạng thái",
      width: 170,
      render: (r) => r.status,
      filterKind: "select",
      filterOptions: STATUS_OPTIONS,
    },
    {
      key: "invoice",
      label: "Hóa đơn bán",
      width: 130,
      render: (r) => (r.invoice ? <span className="text-primary">{r.invoice}</span> : ""),
    },
  ];

  const rows = useMemo(() => TEMPORARY_ISSUES_MOCK_ROWS, []);

  return (
    <StorageReportShell<TempIssueRow>
      title="Hàng hóa xuất kho tạm"
      storageKey="reports/storage/temporary-issues"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[0]!, values) },
        { label: "Ca làm việc", value: resolveLabel(filterFields[2]!, values) },
      ]}
      columns={columns}
      rows={rows}
      emptyLabel="Không có dữ liệu xuất kho tạm."
      getRowKey={(r, i) => `${r.sku}-${r.date}-${r.time}-${i}`}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            o: a.o + r.outQty,
            t: a.t + r.returnQty,
            b: a.b + r.saleQty,
            r: a.r + r.remainingQty,
          }),
          { o: 0, t: 0, b: 0, r: 0 },
        );
        return {
          outQty: sum.o,
          returnQty: sum.t,
          saleQty: sum.b,
          remainingQty: sum.r,
        };
      }}
    />
  );
}
