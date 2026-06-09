import { useMemo, useState } from "react";
import {
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import {
  ALL_VALUE,
  StorageReportShell,
  buildApiFilters,
  resolveLabel,
  type FilterField,
  type FilterValues,
} from "./_shared";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import { useStockSummaryReport } from "../../../hooks/use-inventory-reports";
import type { StockPeriodRow } from "../../../api/inventory-reports";
import { useBranches } from "../../../hooks/iam/useBranches";
import {
  useReportStorages,
  useReportCategories,
  useReportUnits,
} from "../../../hooks/use-report-filter-options";

const STAT_OPTIONS = [
  { value: "item", label: "Hàng hóa" },
  { value: "parent", label: "Mẫu mã" },
  { value: "group", label: "Nhóm hàng hóa" },
];

/** Row shape consumed by the existing column definitions. */
interface ViewRow {
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  group: string;
  parentSku: string;
  parentName: string;
  brand: string;
  color: string;
  size: string;
  positionCode: string;
  positionName: string;
  branchCode: string;
  branch: string;
  supplier: string;
  warehouseCode: string;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  transferOutQty: number;
  transferOutValue: number;
  incomingQty: number;
  incomingValue: number;
}

function mapApiRow(row: StockPeriodRow): ViewRow {
  return {
    itemId: row.itemId,
    sku: row.sku,
    name: row.itemName,
    unit: row.unit,
    group: row.categoryName ?? "",
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    brand: "",
    color: "",
    size: "",
    positionCode: row.locationCode ?? "",
    positionName: row.locationName ?? "",
    branchCode: row.branchCode ?? "",
    branch: row.branchName ?? "",
    supplier: "",
    warehouseCode: row.locationCode ?? row.branchCode ?? "",
    openingQty: row.openingQty,
    openingValue: row.openingValue,
    inQty: row.inQty,
    inValue: row.inValue,
    outQty: row.outQty,
    outValue: row.outValue,
    transferOutQty: 0,
    transferOutValue: 0,
    incomingQty: 0,
    incomingValue: 0,
  };
}

export function StockSummaryReportPage() {
  const { data: branches } = useBranches();
  const { options: allWarehouseOptions } = useReportStorages();
  const { options: groupOptions } = useReportCategories();
  const { options: unitOptions } = useReportUnits();

  const [filterValues, setFilterValues] = useState<FilterValues>({});

  const storeOptions = useMemo(
    () => (branches ?? []).map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  // Filter warehouse options by the applied store selection.
  const warehouseOptions = useMemo(() => {
    const mode = filterValues.store as string | undefined;
    if (!mode || mode === ALL_VALUE) return allWarehouseOptions;
    const branchIds = filterValues["store__values"] as string[] | undefined;
    if (!branchIds || branchIds.length === 0) return allWarehouseOptions;
    const branchSet = new Set(branchIds);
    return allWarehouseOptions.filter(
      (o) => o.value === ALL_VALUE || (o.branchId != null && branchSet.has(o.branchId)),
    );
  }, [allWarehouseOptions, filterValues]);

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
      {
        key: "warehouse",
        label: "Kho",
        type: "select",
        options: warehouseOptions,
        dependsOn: "store",
        visibleWhen: (draft) => {
          const mode = draft.store as string | undefined;
          if (!mode || mode === ALL_VALUE) return false;
          const selected = draft["store__values"] as string[] | undefined;
          return selected != null && selected.length > 0;
        },
      },
      {
        key: "group",
        label: "Nhóm hàng hóa",
        type: "select",
        options: groupOptions,
      },
      {
        key: "stat",
        label: "Thống kê theo",
        type: "select",
        options: STAT_OPTIONS,
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        type: "select",
        options: unitOptions,
      },
      { key: "period", label: "Kỳ báo cáo", type: "period" },
    ],
    [storeOptions, warehouseOptions, groupOptions, unitOptions],
  );
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));

  const apiFilters = useMemo(
    () =>
      buildApiFilters(filterValues, period, {
        storeFieldKey: "store",
        categoryFieldKey: "group",
        warehouseFieldKey: "warehouse",
        statFieldKey: "stat",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useStockSummaryReport(apiFilters);

  const unitFilter = (filterValues.unit as string | undefined) ?? "__all__";

  const rows = useMemo<ViewRow[]>(() => {
    const raw = (data?.data ?? []).map(mapApiRow);
    if (unitFilter !== "__all__") {
      return raw.filter((r) => r.unit === unitFilter);
    }
    return raw;
  }, [data, unitFilter]);

  // Unit column filter options — exclude the "Tất cả ĐVT" sentinel
  const unitFilterOptions = useMemo(() => unitOptions.slice(1), [unitOptions]);

  const num = "text-right tabular-nums";
  const columns: TableColumn<ViewRow>[] = [
    {
      key: "image",
      label: "Ảnh hàng hóa",
      width: 110,
      filterKind: "none",
      render: () => (
        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          📦
        </div>
      ),
    },
    { key: "name", label: "Tên hàng hóa", width: 240, render: (r) => r.name },
    {
      key: "parentSku",
      label: "Mã SKU mẫu mã",
      width: 140,
      render: (r) => r.parentSku,
    },
    {
      key: "parentName",
      label: "Tên Mẫu mã",
      width: 160,
      render: (r) => r.parentName,
    },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 110,
      render: (r) => r.unit,
      filterKind: "select",
      filterOptions: unitFilterOptions,
    },
    {
      key: "group",
      label: "Nhóm hàng hóa",
      width: 140,
      render: (r) => r.group,
    },
    { key: "brand", label: "Thương hiệu", width: 120, render: (r) => r.brand },
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    {
      key: "positionCode",
      label: "Mã vị trí",
      width: 110,
      render: (r) => r.positionCode,
    },
    {
      key: "positionName",
      label: "Tên vị trí",
      width: 110,
      render: (r) => r.positionName,
    },
    {
      key: "openingQty",
      group: "Tồn đầu kỳ",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.openingQty,
    },
    {
      key: "openingValue",
      group: "Tồn đầu kỳ",
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => formatMoneyInteger(r.openingValue),
    },
    {
      key: "inQty",
      group: "Nhập trong kỳ",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.inQty,
    },
    {
      key: "inValue",
      group: "Nhập trong kỳ",
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => formatMoneyInteger(r.inValue),
    },
    {
      key: "outQty",
      group: "Xuất trong kỳ",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.outQty,
    },
    {
      key: "outValue",
      group: "Xuất trong kỳ",
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => formatMoneyInteger(r.outValue),
    },
    {
      key: "endingQty",
      group: "Tồn cuối kỳ",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.openingQty + r.inQty - r.outQty,
    },
    {
      key: "endingValue",
      group: "Tồn cuối kỳ",
      label: "Giá trị",
      width: 140,
      headerClassName: "text-right",
      className: num,
      render: (r) =>
        formatMoneyInteger(r.openingValue + r.inValue - r.outValue),
    },
    {
      key: "transferOutQty",
      group: "Đang chuyển đi",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.transferOutQty,
    },
    {
      key: "transferOutValue",
      group: "Đang chuyển đi",
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => formatMoneyInteger(r.transferOutValue),
    },
    {
      key: "incomingQty",
      group: "Sắp nhận về",
      label: "Số lượng",
      width: 110,
      headerClassName: "text-right",
      className: num,
      render: (r) => r.incomingQty,
    },
    {
      key: "incomingValue",
      group: "Sắp nhận về",
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: num,
      render: (r) => formatMoneyInteger(r.incomingValue),
    },
    {
      key: "supplier",
      label: "Nhà cung cấp",
      width: 160,
      render: (r) => r.supplier,
    },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Tổng hợp nhập xuất tồn kho"
      storageKey="reports/storage/stock-summary"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Kho", value: resolveLabel(filterFields[1]!, values) },
        {
          label: "Nhóm hàng hóa",
          value: resolveLabel(filterFields[2]!, values),
        },
        {
          label: "Thống kê theo",
          value: resolveLabel(filterFields[3]!, values),
        },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có dữ liệu cho khoảng thời gian này."
      getRowKey={(r, i) => `${r.itemId}-${r.warehouseCode}-${i}`}
      initialPeriod={period}
      onApply={(next, nextPeriod) => {
        setFilterValues(next);
        setPeriod(nextPeriod);
      }}
      columnSummary={(rs) => {
        const sum = rs.reduce(
          (a, r) => ({
            o: a.o + r.openingQty,
            ov: a.ov + r.openingValue,
            i: a.i + r.inQty,
            iv: a.iv + r.inValue,
            x: a.x + r.outQty,
            xv: a.xv + r.outValue,
            t: a.t + r.transferOutQty,
            tv: a.tv + r.transferOutValue,
            ic: a.ic + r.incomingQty,
            icv: a.icv + r.incomingValue,
          }),
          { o: 0, ov: 0, i: 0, iv: 0, x: 0, xv: 0, t: 0, tv: 0, ic: 0, icv: 0 },
        );
        return {
          openingQty: sum.o,
          openingValue: formatMoneyInteger(sum.ov),
          inQty: sum.i,
          inValue: formatMoneyInteger(sum.iv),
          outQty: sum.x,
          outValue: formatMoneyInteger(sum.xv),
          endingQty: sum.o + sum.i - sum.x,
          endingValue: formatMoneyInteger(sum.ov + sum.iv - sum.xv),
          transferOutQty: sum.t,
          transferOutValue: formatMoneyInteger(sum.tv),
          incomingQty: sum.ic,
          incomingValue: formatMoneyInteger(sum.icv),
        };
      }}
    />
  );
}
