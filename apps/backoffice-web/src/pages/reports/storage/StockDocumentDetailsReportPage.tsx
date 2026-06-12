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
import { useStockDocumentDetailsReport } from "../../../hooks/use-inventory-reports";
import type { DocumentDetailRow } from "../../../api/inventory-reports";
import { useBranches } from "../../../hooks/iam/useBranches";
import { useReportCategories } from "../../../hooks/use-report-filter-options";
const DOC_TYPE_OPTIONS = [
  { value: "__all__", label: "Tất cả" },
  { value: "PNK", label: "Phiếu nhập kho mua hàng" },
  { value: "PXK", label: "Phiếu xuất kho bán hàng" },
  { value: "PCC", label: "Phiếu điều chuyển kho" },
];

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DOC_KIND_LABEL: Record<DocumentDetailRow["docKind"], string> = {
  GOODS_RECEIPT: "Phiếu nhập kho mua hàng",
  GOODS_ISSUE: "Phiếu xuất kho bán hàng",
  STOCK_TRANSFER: "Phiếu điều chuyển kho",
};

interface ViewRow {
  id: string;
  date: string;
  documentType: string;
  warehouse: string;
  documentNumber: string;
  reference: string;
  sku: string;
  name: string;
  unit: string;
  notes: string;
  group: string;
  parentSku: string;
  parentName: string;
  color: string;
  size: string;
  inQty: number;
  inUnitPrice: number;
  inValue: number;
  inSalePrice: number;
  outQty: number;
  outUnitPrice: number;
  outValue: number;
  outSalePrice: number;
  customer: string;
  branchCode: string;
  branchName: string;
  receiverBranchCode: string;
  receiverBranchName: string;
}

function mapApiRow(row: DocumentDetailRow, index: number): ViewRow {
  const posted = new Date(row.postedAt);
  return {
    id: `${row.documentNumber}-${row.sku}-${index}`,
    date: Number.isNaN(posted.valueOf()) ? "" : DATE_FMT.format(posted),
    documentType: DOC_KIND_LABEL[row.docKind] ?? row.docKind,
    warehouse: row.locationName ?? row.branchName ?? "",
    documentNumber: row.documentNumber,
    reference: row.referenceNumber ?? "",
    sku: row.sku,
    name: row.itemName,
    unit: row.unit,
    notes: row.notes ?? "",
    group: row.categoryName ?? "",
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: row.color ?? "",
    size: row.size ?? "",
    inQty: row.inQty,
    inUnitPrice: row.inUnitPrice,
    inValue: row.inValue,
    inSalePrice: 0,
    outQty: row.outQty,
    outUnitPrice: row.outUnitPrice,
    outValue: row.outValue,
    outSalePrice: 0,
    customer: row.customerName ?? "",
    branchCode: "",
    branchName: row.branchName ?? "",
    receiverBranchCode: "",
    receiverBranchName: row.receiverBranchName ?? "",
  };
}

export function StockDocumentDetailsReportPage() {
  const { data: branches } = useBranches();
  const { options: groupOptions } = useReportCategories();

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
      { key: "group", label: "Nhóm hàng hóa", type: "select", options: groupOptions },
      { key: "period", label: "Kỳ báo cáo", type: "period" },
    ],
    [storeOptions, groupOptions],
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
        categoryFieldKey: "group",
      }),
    [filterValues, period],
  );

  const { data, isLoading } = useStockDocumentDetailsReport(apiFilters);
  const rows = useMemo<ViewRow[]>(
    () => (data?.data ?? []).map((r, i) => mapApiRow(r, i)),
    [data],
  );

  const num = "text-right tabular-nums";
  const fmt = (v: number) => (v ? formatMoneyInteger(v) : "");
  const columns: TableColumn<ViewRow>[] = [
    { key: "date", label: "Ngày chứng từ", width: 140, render: (r) => r.date, filterKind: "date" },
    { key: "documentType", label: "Loại chứng từ", width: 200, render: (r) => r.documentType, filterKind: "select", filterOptions: DOC_TYPE_OPTIONS.slice(1).map((o) => ({ value: o.label, label: o.label })) },
    { key: "warehouse", label: "Kho", width: 180, render: (r) => r.warehouse },
    { key: "documentNumber", label: "Số chứng từ", width: 130, render: (r) => <span className="text-primary">{r.documentNumber}</span> },
    { key: "reference", label: "Tham chiếu", width: 120, render: (r) => r.reference },
    { key: "sku", label: "Mã SKU", width: 140, render: (r) => r.sku },
    { key: "name", label: "Tên hàng hóa", width: 220, render: (r) => r.name },
    { key: "unit", label: "Đơn vị tính", width: 110, render: (r) => r.unit },
    { key: "notes", label: "Ghi chú hàng hóa", width: 160, render: (r) => r.notes },
    { key: "group", label: "Nhóm hàng hóa", width: 140, render: (r) => r.group },
    { key: "parentSku", label: "SKU mẫu mã", width: 130, render: (r) => r.parentSku },
    { key: "parentName", label: "Tên mẫu mã", width: 130, render: (r) => r.parentName },
    { key: "color", label: "Màu sắc", width: 100, render: (r) => r.color },
    { key: "size", label: "Size", width: 80, render: (r) => r.size },
    { key: "inQty",       group: "Nhập kho", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.inQty || "" },
    { key: "inUnitPrice", group: "Nhập kho", label: "Đơn giá",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.inUnitPrice) },
    { key: "inValue",     group: "Nhập kho", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => fmt(r.inValue) },
    { key: "inSalePrice", group: "Nhập kho", label: "Giá bán",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.inSalePrice) },
    { key: "outQty",       group: "Xuất kho", label: "Số lượng", width: 110, headerClassName: "text-right", className: num, render: (r) => r.outQty || "" },
    { key: "outUnitPrice", group: "Xuất kho", label: "Đơn giá",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.outUnitPrice) },
    { key: "outValue",     group: "Xuất kho", label: "Giá trị",  width: 130, headerClassName: "text-right", className: num, render: (r) => fmt(r.outValue) },
    { key: "outSalePrice", group: "Xuất kho", label: "Giá bán",  width: 120, headerClassName: "text-right", className: num, render: (r) => fmt(r.outSalePrice) },
    { key: "customer", label: "Đối tượng", width: 160, render: (r) => r.customer },
    { key: "branchCode", label: "Mã cửa hàng", width: 130, render: (r) => r.branchCode },
    { key: "branchName", label: "Tên cửa hàng", width: 180, render: (r) => r.branchName },
    { key: "receiverBranchCode", label: "Mã cửa hàng nhận", width: 160, render: (r) => r.receiverBranchCode },
    { key: "receiverBranchName", label: "Tên cửa hàng nhận", width: 180, render: (r) => r.receiverBranchName },
  ];

  return (
    <StorageReportShell<ViewRow>
      title="Bảng kê chi tiết phiếu nhập xuất kho"
      storageKey="reports/storage/stock-document-details"
      filterFields={filterFields}
      buildSubtitle={(values) => [
        { label: "Cửa hàng", value: resolveLabel(filterFields[0]!, values) },
        { label: "Nhóm hàng hóa", value: resolveLabel(filterFields[1]!, values) },
      ]}
      columns={columns}
      rows={rows}
      loading={isLoading}
      emptyLabel="Không có chứng từ trong kỳ."
      getRowKey={(r) => r.id}
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
          }),
          { iq: 0, iv: 0, oq: 0, ov: 0 },
        );
        return {
          inQty: sum.iq,
          inValue: sum.iv ? formatMoneyInteger(sum.iv) : "",
          outQty: sum.oq,
          outValue: sum.ov ? formatMoneyInteger(sum.ov) : "",
        };
      }}
    />
  );
}
