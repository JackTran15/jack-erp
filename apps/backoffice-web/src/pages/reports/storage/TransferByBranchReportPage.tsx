import { useMemo, useState } from "react";
import {
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import {
  StorageReportShell,
  buildApiFilters,
  pickSourceBranchId,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { useTransferByBranchReport } from "../../../hooks/use-inventory-reports";
import type {
  TransferByBranchFilters,
  TransferByBranchRow as ApiTransferByBranchRow,
} from "../../../api/inventory-reports";
import { useBranches } from "../../../hooks/iam/useBranches";
import {
  useReportCategories,
  useReportUnits,
} from "../../../hooks/use-report-filter-options";

const STAT_OPTIONS = [
  { value: "item",   label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
  { value: "group",  label: "Nhóm hàng hóa" },
];

interface ViewRow {
  itemId: string;
  destinationBranchId: string;
  sku: string;
  name: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  unit: string;
  group: string;
  brand: string;
  targetBranch: string;
  outQty: number;
  outAvgPrice: number;
  outValue: number;
  inQty: number;
  inAvgPrice: number;
  inValue: number;
}

function mapApiRow(row: ApiTransferByBranchRow): ViewRow {
  return {
    itemId: row.itemId,
    destinationBranchId: row.destinationBranchId,
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: "",
    brand: "",
    targetBranch: row.destinationBranchName,
    outQty: row.outQty,
    outAvgPrice: row.outAvgPrice,
    outValue: row.outValue,
    inQty: row.inQty,
    inAvgPrice: row.inAvgPrice,
    inValue: row.inValue,
  };
}

export function TransferByBranchReportPage() {
  const { data: branches } = useBranches();
  const { options: groupOptions } = useReportCategories();
  const { options: unitOptions } = useReportUnits();

  const branchOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: "sourceStore",
        label: "Cửa hàng xuất",
        type: "select",
        options: [{ value: "__all__", label: "Tất cả" }, ...branchOptions],
      },
      {
        key: "targetStore",
        label: "Cửa hàng nhận",
        type: "radio-scope",
        allLabel: "Tất cả",
        scopeLabel: "Chọn cửa hàng",
        options: branchOptions,
        placeholder: "Chọn cửa hàng nhận",
      },
      { key: "group",  label: "Nhóm hàng hóa", type: "select", options: groupOptions },
      { key: "stat",   label: "Thống kê theo",  type: "select", options: STAT_OPTIONS },
      { key: "unit",   label: "Đơn vị tính",    type: "select", options: unitOptions },
      { key: "period", label: "Kỳ báo cáo",     type: "period" },
    ],
    [branchOptions, groupOptions, unitOptions],
  );

  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));

  const unitFilter = (filterValues.unit as string | undefined) ?? "__all__";

  const apiFilters: TransferByBranchFilters = useMemo(() => {
    const base = buildApiFilters(filterValues, period, {
      storeFieldKey: "targetStore",
      categoryFieldKey: "group",
      statFieldKey: "stat",
    });
    const sourceBranchId = pickSourceBranchId(filterValues, "sourceStore");
    return { ...base, sourceBranchId };
  }, [filterValues, period]);

  const { data, isLoading } = useTransferByBranchReport(apiFilters);
  const rows = useMemo<ViewRow[]>(() => {
    const raw = (data?.data ?? []).map(mapApiRow);
    if (unitFilter !== "__all__") return raw.filter((r) => r.unit === unitFilter);
    return raw;
  }, [data, unitFilter]);

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = [
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "parentSku", label: "Mã SKU mẫu mã", width: 140, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên Mẫu mã", width: 150, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
    { key: "targetBranch", label: "Cửa hàng nhận điều chuyển", width: 220, render: (r) => r.targetBranch },
    { key: "outQty",      label: "Số lượng xuất",        width: 130, headerClassName: "text-right", className: num, render: (r) => r.outQty },
    { key: "outAvgPrice", label: "Đơn giá xuất trung bình", width: 160, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outAvgPrice) },
    { key: "outValue",    label: "Giá trị xuất",         width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.outValue) },
    { key: "inQty",       label: "Số lượng nhập",        width: 130, headerClassName: "text-right", className: num, render: (r) => r.inQty },
    { key: "inAvgPrice",  label: "Đơn giá nhập trung bình", width: 160, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inAvgPrice) },
    { key: "inValue",     label: "Giá trị nhập",         width: 140, headerClassName: "text-right", className: num, render: (r) => formatMoneyInteger(r.inValue) },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Tổng hợp hàng hóa điều chuyển theo cửa hàng"
      storageKey="reports/storage/transfer-by-branch"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng xuất", value: resolveLabel(filterFields[0]!, values) },
        { label: "Cửa hàng nhận", value: resolveLabel(filterFields[1]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[2]!, values) },
        { label: "Thống kê theo", value: resolveLabel(filterFields[3]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu điều chuyển theo cửa hàng."
      getRowKey={(r, i) => `${r.itemId}-${r.destinationBranchId}-${i}`}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            oq: a.oq + r.outQty,
            ov: a.ov + r.outValue,
            iq: a.iq + r.inQty,
            iv: a.iv + r.inValue,
          }),
          { oq: 0, ov: 0, iq: 0, iv: 0 },
        );
        return {
          outQty: sum.oq,
          outValue: formatMoneyInteger(sum.ov),
          inQty: sum.iq,
          inValue: formatMoneyInteger(sum.iv),
        };
      }}
    />
  );
}
