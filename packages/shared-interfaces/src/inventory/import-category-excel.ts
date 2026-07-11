/**
 * Canonical Excel column keys for MISA-style item-category import/export
 * (template `DanhMucNhomHangHoa.xls`).
 *
 * Layout differs from the customer template: rows 1-4 blank, row 5 title,
 * row 6 = EN keys (hidden), row 7 = Vietnamese labels, data from row 8.
 * The keys row is located dynamically by `ItemCategoryCode`; data starts
 * TWO rows below it (one label row in between).
 */
export enum ItemCategoryImportExcelField {
  ITEM_CATEGORY_CODE = 'ItemCategoryCode',
  ITEM_CATEGORY_NAME = 'ItemCategoryName',
  PARENT_NAME = 'ParentName',
  TAX_RATE = 'TaxRate',
}

export const ITEM_CATEGORY_IMPORT_EXCEL_FIELD_LABELS: Record<
  ItemCategoryImportExcelField,
  string
> = {
  [ItemCategoryImportExcelField.ITEM_CATEGORY_CODE]: 'Mã nhóm hàng hóa (*)',
  [ItemCategoryImportExcelField.ITEM_CATEGORY_NAME]: 'Tên nhóm hàng hóa (*)',
  [ItemCategoryImportExcelField.PARENT_NAME]: 'Thuộc nhóm hàng hóa',
  [ItemCategoryImportExcelField.TAX_RATE]: 'Thuế suất',
};

export const ITEM_CATEGORY_IMPORT_EXCEL_COLUMN_ORDER: ItemCategoryImportExcelField[] =
  [
    ItemCategoryImportExcelField.ITEM_CATEGORY_CODE,
    ItemCategoryImportExcelField.ITEM_CATEGORY_NAME,
    ItemCategoryImportExcelField.PARENT_NAME,
    ItemCategoryImportExcelField.TAX_RATE,
  ];

export type ItemCategoryImportExcelRow = Record<string, string>;
