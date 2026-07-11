import {
  ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER,
  ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS,
} from "@erp/shared-interfaces";
import { TableColumn } from "../../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../../components/status/StatusBadge";
import type { ImportReviewRow } from "../../../../components/shared/import-wizard/types";

/** 4 template columns + Tình trạng for the category import review step. */
export function buildCategoryImportReviewColumns(): TableColumn<ImportReviewRow>[] {
  const dataCols: TableColumn<ImportReviewRow>[] =
    ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER.map((excelKey) => ({
      key: excelKey,
      label: ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS[excelKey],
      width: 180,
      render: (row) => {
        const value = row.rawData[excelKey];
        return value === null || value === undefined ? "" : String(value);
      },
    }));

  return [
    ...dataCols,
    {
      key: "status",
      label: "Tình trạng",
      width: 300,
      render: (row) => (
        <StatusBadge variant={row.isError ? "danger" : "success"}>
          {row.statusLabel}
        </StatusBadge>
      ),
    },
  ];
}
