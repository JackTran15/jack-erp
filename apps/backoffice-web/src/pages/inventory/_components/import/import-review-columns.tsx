import {
  InventoryImportExcelField,
  INVENTORY_IMPORT_EXCEL_COLUMN_ORDER,
  INVENTORY_IMPORT_EXCEL_FIELD_LABELS,
  INVENTORY_IMPORT_MVP_FIELDS,
  ImportRowStatus,
} from "@erp/shared-interfaces";
import type { ImportJobRow, ImportReviewRow } from "./import-inventory.types";
import { TableColumn } from "../../../../components/table/BaseDataTable";

const RIGHT_ALIGN_FIELDS = new Set<InventoryImportExcelField>([
  InventoryImportExcelField.COST_PRICE,
  InventoryImportExcelField.UNIT_PRICE,
  InventoryImportExcelField.OPENING_QUANTITY,
  InventoryImportExcelField.OPENING_AMOUNT,
  InventoryImportExcelField.MINIMUM_STOCK,
  InventoryImportExcelField.MAXIMUM_STOCK,
  InventoryImportExcelField.UNIT_CONVERT_RATE,
  InventoryImportExcelField.UNIT_CONVERT_COST_PRICE,
  InventoryImportExcelField.UNIT_CONVERT_SALE_PRICE,
]);

/** Columns shown in the import review grid (all MVP fields). */
export const IMPORT_REVIEW_PREVIEW_FIELDS: InventoryImportExcelField[] =
  INVENTORY_IMPORT_MVP_FIELDS;

/** MISA review grid: 41 columns (excludes box/wholesale price). */
const REVIEW_EXCEL_FIELDS = INVENTORY_IMPORT_EXCEL_COLUMN_ORDER.filter(
  (field) =>
    field !== InventoryImportExcelField.UNIT_PRICE_BOX &&
    field !== InventoryImportExcelField.UNIT_PRICE_WHOLE_SALE,
);

const COLUMN_WIDTHS: Partial<Record<InventoryImportExcelField, number>> = {
  [InventoryImportExcelField.SKU_CODE]: 140,
  [InventoryImportExcelField.BAR_CODE]: 120,
  [InventoryImportExcelField.MODEL_CODE]: 130,
  [InventoryImportExcelField.MODEL_NAME]: 160,
  [InventoryImportExcelField.INVENTORY_ITEM_NAME]: 200,
  [InventoryImportExcelField.ITEM_CATEGORY_CODE]: 130,
  [InventoryImportExcelField.ITEM_CATEGORY_NAME]: 150,
  [InventoryImportExcelField.BRAND_NAME]: 130,
  [InventoryImportExcelField.UNIT_NAME]: 80,
  [InventoryImportExcelField.SHOW_IN_MENU]: 180,
};

function cellValue(
  raw: Record<string, unknown>,
  excelKey: InventoryImportExcelField,
): string {
  const v = raw[excelKey];
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

function formatDisplayValue(
  raw: Record<string, unknown>,
  excelKey: InventoryImportExcelField,
): string {
  const text = cellValue(raw, excelKey);
  if (!text) return "";
  if (RIGHT_ALIGN_FIELDS.has(excelKey)) {
    const n = Number(text.replace(/\./g, "").replace(",", "."));
    if (!Number.isNaN(n) && text.match(/[\d,.]/)) {
      return new Intl.NumberFormat("vi-VN").format(n);
    }
  }
  return text;
}

export function toImportReviewRows(rows: ImportJobRow[]): ImportReviewRow[] {
  return rows.map((row) => {
    const isError = row.status === ImportRowStatus.ERROR;
    const statusLabel = isError
      ? (row.errorMessages?.map((e) => e.message).join(" ") ?? "Không hợp lệ")
      : "Hợp lệ";
    return { ...row, statusLabel, isError };
  });
}

function buildColumnsForFields(
  fields: InventoryImportExcelField[],
): TableColumn<ImportReviewRow>[] {
  return fields.map((excelKey) => ({
    key: excelKey,
    label: INVENTORY_IMPORT_EXCEL_FIELD_LABELS[excelKey],
    width: COLUMN_WIDTHS[excelKey] ?? 120,
    className: RIGHT_ALIGN_FIELDS.has(excelKey)
      ? "text-right tabular-nums"
      : undefined,
    headerClassName: RIGHT_ALIGN_FIELDS.has(excelKey)
      ? "text-right"
      : undefined,
    render: (row) => {
      const text = formatDisplayValue(row.rawData, excelKey);
      if (
        excelKey === InventoryImportExcelField.INVENTORY_ITEM_NAME &&
        text.length > 28
      ) {
        return (
          <span className="block max-w-[200px] truncate" title={text}>
            {text}
          </span>
        );
      }
      return text;
    },
  }));
}

function buildStatusColumn(): TableColumn<ImportReviewRow> {
  return {
    key: "status",
    label: "Tình trạng",
    width: 300,
    render: (row) => (
      <span className={row.isError ? "text-destructive" : "text-foreground"}>
        {row.statusLabel}
      </span>
    ),
  };
}

/** MVP field columns + Tình trạng for the import review step. */
export function buildImportReviewPreviewColumns(): TableColumn<ImportReviewRow>[] {
  return [
    ...buildColumnsForFields(IMPORT_REVIEW_PREVIEW_FIELDS),
    buildStatusColumn(),
  ];
}

export function buildImportReviewColumns(): TableColumn<ImportReviewRow>[] {
  const dataCols: TableColumn<ImportReviewRow>[] = REVIEW_EXCEL_FIELDS.map(
    (excelKey) => ({
      key: excelKey,
      label: INVENTORY_IMPORT_EXCEL_FIELD_LABELS[excelKey],
      width: COLUMN_WIDTHS[excelKey] ?? 120,
      className: RIGHT_ALIGN_FIELDS.has(excelKey)
        ? "text-right tabular-nums"
        : undefined,
      headerClassName: RIGHT_ALIGN_FIELDS.has(excelKey)
        ? "text-right"
        : undefined,
      render: (row) => formatDisplayValue(row.rawData, excelKey),
    }),
  );

  return [...dataCols, buildStatusColumn()];
}
