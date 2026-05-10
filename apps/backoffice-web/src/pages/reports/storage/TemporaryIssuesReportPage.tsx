import { useMemo } from "react";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";

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

interface TempIssueRow {
  sku: string;
  name: string;
  unit: string;
  location: string;
  date: string;
  time: string;
  staff: string;
  outQty: number;
  returnQty: number;
  saleQty: number;
  remainingQty: number;
  status: string;
  invoice: string;
}

const MOCK_ROWS: TempIssueRow[] = [
  { sku: "MY1231-DO-36", name: "Giày thể thao MY1231-DO-36", unit: "Đôi", location: "", date: "08/05/2026", time: "16:45:51", staff: "Phan Thanh Hà", outQty: 0, returnQty: 1, saleQty: 0, remainingQty: 1, status: "Trả hàng trưng bày", invoice: "" },
  { sku: "TOAN1232-D-40", name: "Giày nam TOAN1232-D-40", unit: "Đôi", location: "", date: "08/05/2026", time: "10:46:24", staff: "Phan Thanh Hà", outQty: 1, returnQty: 0, saleQty: 0, remainingQty: -1, status: "Xuất không bán", invoice: "" },
  { sku: "AKCV19837-D-41", name: "Giày nam AKCV19837-D-41", unit: "Đôi", location: "", date: "08/05/2026", time: "00:24:43", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010015" },
  { sku: "MY3007-D-35", name: "Dép nữ MY3007-D-35", unit: "Đôi", location: "", date: "08/05/2026", time: "00:24:43", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010015" },
  { sku: "MY63652-D-35", name: "Sandal nữ MY63652-D-35", unit: "Đôi", location: "", date: "08/05/2026", time: "00:16:51", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010014" },
  { sku: "MY3007-D-35", name: "Dép nữ MY3007-D-35", unit: "Đôi", location: "", date: "07/05/2026", time: "21:18:23", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010013" },
  { sku: "MY63652-D-36", name: "Sandal nữ MY63652-D-36", unit: "Đôi", location: "", date: "06/05/2026", time: "19:56:33", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010012" },
  { sku: "MY63652-D-37", name: "Sandal nữ MY63652-D-37", unit: "Đôi", location: "", date: "06/05/2026", time: "00:53:25", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 4, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010011" },
  { sku: "CTH64982-D-39", name: "Giày nam CTH64982-D-39", unit: "Đôi", location: "", date: "06/05/2026", time: "00:15:02", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 0, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010008" },
  { sku: "PGIA222-D-35", name: "Giày nữ PGIA222-D-35", unit: "Đôi", location: "", date: "05/05/2026", time: "23:59:08", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010007" },
  { sku: "DUG02030-N-39", name: "Dép nam DUG02030-N-39", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:50", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010006" },
  { sku: "MY63652-D-36", name: "Sandal nữ MY63652-D-36", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:25", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010005" },
  { sku: "AKCV19837-D-38", name: "Giày nam AKCV19837-D-38", unit: "Đôi", location: "", date: "05/05/2026", time: "17:09:10", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010002" },
  { sku: "MY63652-D-35", name: "Sandal nữ MY63652-D-35", unit: "Đôi", location: "", date: "05/05/2026", time: "17:08:34", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010004" },
  { sku: "CTH64982-N-38", name: "Giày nam CTH64982-N-38", unit: "Đôi", location: "", date: "05/05/2026", time: "17:08:24", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010003" },
  { sku: "SAN822-D-39", name: "Dép nam SAN822-D-39", unit: "Đôi", location: "", date: "05/05/2026", time: "17:05:32", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2604010001" },
  { sku: "CTH64982-N-41", name: "Giày nam CTH64982-N-41", unit: "Đôi", location: "", date: "05/05/2026", time: "17:04:23", staff: "Phan Thanh Hà", outQty: 0, returnQty: 0, saleQty: 1, remainingQty: 0, status: "Bán hàng trưng bày", invoice: "2605010001" },
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

  const rows = useMemo(() => MOCK_ROWS, []);

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
