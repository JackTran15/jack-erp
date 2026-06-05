import { useMemo, useState } from "react";
import {
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import {
  StorageReportShell,
  buildApiFilters,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { useTransferSummaryReport } from "../../../hooks/use-inventory-reports";
import type { TransferSummaryRow as ApiTransferSummaryRow } from "../../../api/inventory-reports";
import { useBranches } from "../../../hooks/iam/useBranches";

interface ViewRow {
  branchId: string;
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

function mapApiRow(row: ApiTransferSummaryRow): ViewRow {
  return {
    branchId: row.branchId,
    branchCode: row.branchCode ?? "",
    branchName: row.branchName,
    inQty: row.qtyIn,
    inValue: row.valueIn,
    outQty: row.qtyOut,
    outValue: row.valueOut,
    receivedQty: row.qtyReceived,
    receivedValue: row.valueReceived,
    diffQty: row.qtyDifference,
    diffValue: row.valueDifference,
    // The endpoint exposes a single "difference" metric; we keep the two
    // legacy columns aligned for now.
    inOutDiffQty: row.qtyDifference,
    inOutDiffValue: row.valueDifference,
  };
}

export function TransferSummaryReportPage() {
  const { data: branches } = useBranches();

  const storeOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: "store",
        label: "Cửa hàng",
        type: "radio-scope",
        allLabel: "Tất cả",
        scopeLabel: "Theo nhóm cửa hàng",
        options: storeOptions,
        placeholder: "Chọn cửa hàng",
      },
      { key: "period", label: "Kỳ báo cáo", type: "period" },
    ],
    [storeOptions],
  );

  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));

  const apiFilters = useMemo(
    () =>
      buildApiFilters(filterValues, period, {
        storeFieldKey: "store",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useTransferSummaryReport(apiFilters);
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map(mapApiRow),
    [data],
  );

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = [
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

  return (
    <StorageReportShell<ViewRow>
      title="Tổng hợp nhập xuất điều chuyển"
      storageKey="reports/storage/transfer-summary"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu điều chuyển."
      getRowKey={(r) => r.branchId || r.branchCode}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
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
