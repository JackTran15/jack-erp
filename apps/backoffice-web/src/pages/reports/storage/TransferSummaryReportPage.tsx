import { useMemo } from "react";
import { formatMoneyInteger } from "@erp/ui";
import {
  StorageReportShell,
  resolveLabel,
  type FilterField,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";

const STORE_OPTIONS = [
  { value: "MTCANTHO", label: "Giày MT Cần Thơ" },
  { value: "MTDANANG", label: "Giày MT Đà Nẵng" },
];

interface TransferSummaryRow {
  branchCode: string;
  branchName: string;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  receivedQty: number;
  receivedValue: number;
  diffQty: number;
  diffValue: number;
  inOutDiffQty: number;
  inOutDiffValue: number;
}

const MOCK_ROWS: TransferSummaryRow[] = [
  {
    branchCode: "CT",
    branchName: "Giày MT Cần Thơ",
    inQty: 5,
    inValue: 1_700_000,
    outQty: 8,
    outValue: 2_720_000,
    receivedQty: 8,
    receivedValue: 2_720_000,
    diffQty: 0,
    diffValue: 0,
    inOutDiffQty: 0,
    inOutDiffValue: 0,
  },
  {
    branchCode: "DN",
    branchName: "Giày MT Đà Nẵng",
    inQty: 8,
    inValue: 2_720_000,
    outQty: 5,
    outValue: 1_700_000,
    receivedQty: 5,
    receivedValue: 1_700_000,
    diffQty: 0,
    diffValue: 0,
    inOutDiffQty: 0,
    inOutDiffValue: 0,
  },
];

export function TransferSummaryReportPage() {
  const filterFields: FilterField[] = [
    {
      key: "store",
      label: "Cửa hàng",
      type: "radio-scope",
      allLabel: "Tất cả",
      scopeLabel: "Theo nhóm cửa hàng",
      options: STORE_OPTIONS,
    },
    { key: "period", label: "Kỳ báo cáo", type: "period" },
  ];

  const num = "text-right tabular-nums";
  const columns: TableColumn<TransferSummaryRow>[] = [
    { key: "branchCode", label: "Mã cửa hàng", width: 130, render: (r) => r.branchCode },
    { key: "branchName", label: "Tên cửa hàng", width: 220, render: (r) => r.branchName },
    { key: "inQty",    group: "Nhập kho điều chuyển", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inValue",  group: "Nhập kho điều chuyển", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inValue) },
    { key: "outQty",   group: "Xuất kho điều chuyển", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outValue", group: "Xuất kho điều chuyển", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outValue) },
    { key: "receivedQty",   group: "Cửa hàng khác thực nhận về", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.receivedQty },
    { key: "receivedValue", group: "Cửa hàng khác thực nhận về", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.receivedValue) },
    { key: "diffQty",   group: "Chênh lệch thực nhận", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.diffQty },
    { key: "diffValue", group: "Chênh lệch thực nhận", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.diffValue) },
    { key: "inOutDiffQty",   group: "Chênh lệch nhập xuất điều chuyển", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inOutDiffQty },
    { key: "inOutDiffValue", group: "Chênh lệch nhập xuất điều chuyển", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inOutDiffValue) },
  ];

  const rows = useMemo(() => MOCK_ROWS, []);

  return (
    <StorageReportShell<TransferSummaryRow>
      title="Tổng hợp nhập xuất điều chuyển"
      storageKey="reports/storage/transfer-summary"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
      ]}
      columns={columns}
      rows={rows}
      emptyLabel="Không có dữ liệu điều chuyển."
      getRowKey={(r) => r.branchCode}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            iq: a.iq + r.inQty,
            iv: a.iv + r.inValue,
            oq: a.oq + r.outQty,
            ov: a.ov + r.outValue,
            rq: a.rq + r.receivedQty,
            rv: a.rv + r.receivedValue,
            dq: a.dq + r.diffQty,
            dv: a.dv + r.diffValue,
            iodq: a.iodq + r.inOutDiffQty,
            iodv: a.iodv + r.inOutDiffValue,
          }),
          { iq: 0, iv: 0, oq: 0, ov: 0, rq: 0, rv: 0, dq: 0, dv: 0, iodq: 0, iodv: 0 },
        );
        return {
          inQty: sum.iq,
          inValue: formatMoneyInteger(sum.iv),
          outQty: sum.oq,
          outValue: formatMoneyInteger(sum.ov),
          receivedQty: sum.rq,
          receivedValue: formatMoneyInteger(sum.rv),
          diffQty: sum.dq,
          diffValue: formatMoneyInteger(sum.dv),
          inOutDiffQty: sum.iodq,
          inOutDiffValue: formatMoneyInteger(sum.iodv),
        };
      }}
    />
  );
}
