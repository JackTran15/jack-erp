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
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
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

  const [gridQuery, setGridQuery] = useState<{
    page: number;
    pageSize: number;
  }>({ page: 1, pageSize: DEFAULT_PAGINATION.pageSize });

  const apiFilters = useMemo(
    () => ({
      ...buildApiFilters(filterValues, period, {
        storeFieldKey: "store",
      }),
      page: gridQuery.page,
      pageSize: gridQuery.pageSize,
    }),
    [filterValues, period, gridQuery],
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
      total={data?.total ?? 0}
      totals={data?.totals}
      onQueryChange={({ page, pageSize }) => setGridQuery({ page, pageSize })}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      // Tổng của toàn tập kết quả, do server tính — không phải tổng trang.
      // Khoá của server theo tên field nghiệp vụ (qtyIn/valueIn…), lưới đặt tên
      // cột khác nên ánh xạ ngay tại đây.
      columnSummary={(_rows, totals) => {
        if (!totals) return {};
        return {
          inQty: totals.qtyIn ?? 0,
          inValue: formatMoneyInteger(totals.valueIn ?? 0),
          outQty: totals.qtyOut ?? 0,
          outValue: formatMoneyInteger(totals.valueOut ?? 0),
          receivedQty: totals.qtyReceived ?? 0,
          receivedValue: formatMoneyInteger(totals.valueReceived ?? 0),
          diffQty: totals.qtyDifference ?? 0,
          diffValue: formatMoneyInteger(totals.valueDifference ?? 0),
          inOutDiffQty: totals.qtyInOutDifference ?? 0,
          inOutDiffValue: formatMoneyInteger(totals.valueInOutDifference ?? 0),
        };
      }}
    />
  );
}
