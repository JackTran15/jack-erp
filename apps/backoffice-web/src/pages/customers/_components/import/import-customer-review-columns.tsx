import {
  CustomerImportExcelField,
  CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER,
  CUSTOMER_IMPORT_EXCEL_FIELD_LABELS,
} from "@erp/shared-interfaces";
import { TableColumn } from "../../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../../components/status/StatusBadge";
import type { ImportReviewRow } from "../../../inventory/_components/import/import-inventory.types";

const COLUMN_WIDTHS: Partial<Record<CustomerImportExcelField, number>> = {
  [CustomerImportExcelField.CUSTOMER_CODE]: 140,
  [CustomerImportExcelField.CUSTOMER_NAME]: 200,
  [CustomerImportExcelField.CUSTOMER_CATEGORY_CODE]: 140,
  [CustomerImportExcelField.TEL]: 130,
  [CustomerImportExcelField.ADDRESS]: 180,
  [CustomerImportExcelField.EMAIL]: 180,
  [CustomerImportExcelField.COMPANY_NAME]: 180,
  [CustomerImportExcelField.EMPLOYEE_NAME]: 180,
};

function buildStatusColumn(): TableColumn<ImportReviewRow> {
  return {
    key: "status",
    label: "Tình trạng",
    width: 300,
    render: (row) => (
      <StatusBadge variant={row.isError ? "danger" : "success"}>
        {row.statusLabel}
      </StatusBadge>
    ),
  };
}

/** 21 template columns + Tình trạng for the customer import review step. */
export function buildCustomerImportReviewColumns(): TableColumn<ImportReviewRow>[] {
  const dataCols: TableColumn<ImportReviewRow>[] =
    CUSTOMER_IMPORT_EXCEL_COLUMN_ORDER.map((excelKey) => ({
      key: excelKey,
      label: CUSTOMER_IMPORT_EXCEL_FIELD_LABELS[excelKey],
      width: COLUMN_WIDTHS[excelKey] ?? 120,
      render: (row) => {
        const value = row.rawData[excelKey];
        const text =
          value === null || value === undefined ? "" : String(value);
        if (excelKey === CustomerImportExcelField.CUSTOMER_NAME && text.length > 28) {
          return (
            <span className="block max-w-[200px] truncate" title={text}>
              {text}
            </span>
          );
        }
        return text;
      },
    }));

  return [...dataCols, buildStatusColumn()];
}
