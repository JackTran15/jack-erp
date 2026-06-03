/** Canonical Excel column keys (row 2) for MISA-style inventory item import/export. */
export enum InventoryImportExcelField {
  SKU_CODE = "SKUCode",
  BAR_CODE = "Barcode",
  MODEL_CODE = "ModelCode",
  MODEL_NAME = "ModelName",
  INVENTORY_ITEM_NAME = "InventoryItemName",
  ITEM_CATEGORY_CODE = "ItemCategoryCode",
  ITEM_CATEGORY_NAME = "ItemCategoryName",
  BRAND_NAME = "BrandName",
  UNIT_NAME = "UnitName",
  COLOR = "Color",
  SIZE = "Size",
  COST_PRICE = "CostPrice",
  UNIT_PRICE = "UnitPrice",
  TAX_RATE = "TaxRate",
  OPENING_QUANTITY = "OpeningQuantity",
  OPENING_AMOUNT = "OpeningAmount",
  OPENING_STOCK_NAME = "OpeningStockName",
  MINIMUM_STOCK = "MinimumStock",
  MAXIMUM_STOCK = "MaximumStock",
  UNIT_CONVERT_NAME = "UnitConvertName",
  UNIT_CONVERT_RATE = "UnitConvertRate",
  UNIT_CONVERT_COST_PRICE = "UnitConvertCostPrice",
  UNIT_CONVERT_SALE_PRICE = "UnitConvertSalePrice",
  IS_SALE_UNIT = "IsSaleUnit",
  IS_COST_UNIT = "IsCostUnit",
  IMAGE_URL = "ImageUrl",
  HEIGHT = "Height",
  WIDTH = "Width",
  LENGTH = "Length",
  WEIGHT = "Weight",
  SHOW_LOCATION = "ShowLocation",
  STOCK_LOCATION = "StockLocation",
  IS_USE_LOT_NO = "IsUseLotNo",
  SELL_BEFORE_DAY = "SellBeforeDay",
  IS_USE_SERIAL = "IsUseSerial",
  SHOW_IN_MENU = "ShowInMenu",
  DESCRIPTION = "Description",
  INACTIVE = "Inactive",
  SIZE_RANGE = "SizeRange",
  INGREDIENT = "Ingredient",
  YEAR_OF_PRODUCTION = "YearOfProduction",
  UNIT_PRICE_BOX = "UnitPriceBox",
  UNIT_PRICE_WHOLE_SALE = "UnitPriceWholeSale",
}

export const INVENTORY_IMPORT_EXCEL_FIELD_LABELS: Record<
  InventoryImportExcelField,
  string
> = {
  [InventoryImportExcelField.SKU_CODE]: "Mã SKU",
  [InventoryImportExcelField.BAR_CODE]: "Mã vạch",
  [InventoryImportExcelField.MODEL_CODE]: "Mã SKU mẫu mã",
  [InventoryImportExcelField.MODEL_NAME]: "Tên mẫu mã",
  [InventoryImportExcelField.INVENTORY_ITEM_NAME]: "Tên hàng hóa (*)",
  [InventoryImportExcelField.ITEM_CATEGORY_CODE]: "Mã nhóm hàng hóa",
  [InventoryImportExcelField.ITEM_CATEGORY_NAME]: "Tên nhóm hàng hóa",
  [InventoryImportExcelField.BRAND_NAME]: "Tên thương hiệu",
  [InventoryImportExcelField.UNIT_NAME]: "ĐVT",
  [InventoryImportExcelField.COLOR]: "Màu",
  [InventoryImportExcelField.SIZE]: "Size",
  [InventoryImportExcelField.COST_PRICE]: "Giá mua",
  [InventoryImportExcelField.UNIT_PRICE]: "Giá bán",
  [InventoryImportExcelField.TAX_RATE]: "Thuế suất (%)",
  [InventoryImportExcelField.OPENING_QUANTITY]: "SL tồn đầu",
  [InventoryImportExcelField.OPENING_AMOUNT]: "Giá trị tồn đầu",
  [InventoryImportExcelField.OPENING_STOCK_NAME]: "Kho tồn",
  [InventoryImportExcelField.MINIMUM_STOCK]: "SL tồn tối thiểu",
  [InventoryImportExcelField.MAXIMUM_STOCK]: "SL tồn tối đa",
  [InventoryImportExcelField.UNIT_CONVERT_NAME]: "Đơn vị chuyển đổi",
  [InventoryImportExcelField.UNIT_CONVERT_RATE]: "Tỷ lệ",
  [InventoryImportExcelField.UNIT_CONVERT_COST_PRICE]:
    "Giá mua theo đơn vị chuyển đổi",
  [InventoryImportExcelField.UNIT_CONVERT_SALE_PRICE]:
    "Giá bán theo đơn vị chuyển đổi",
  [InventoryImportExcelField.IS_SALE_UNIT]: "Đơn vị bán mặc định",
  [InventoryImportExcelField.IS_COST_UNIT]: "Đơn vị nhập mặc định",
  [InventoryImportExcelField.IMAGE_URL]: "Link ảnh hàng hóa",
  [InventoryImportExcelField.HEIGHT]: "Chiều cao",
  [InventoryImportExcelField.WIDTH]: "Chiều rộng",
  [InventoryImportExcelField.LENGTH]: "Chiều dài",
  [InventoryImportExcelField.WEIGHT]: "Cân nặng",
  [InventoryImportExcelField.SHOW_LOCATION]: "Vị trí trưng bày",
  [InventoryImportExcelField.STOCK_LOCATION]: "Vị trí lưu kho",
  [InventoryImportExcelField.IS_USE_LOT_NO]: "Quản lý theo lô, HSD",
  [InventoryImportExcelField.SELL_BEFORE_DAY]: "Cận date (Theo ngày)",
  [InventoryImportExcelField.IS_USE_SERIAL]: "Quản lý theo Serial/IMEI",
  [InventoryImportExcelField.SHOW_IN_MENU]: "Hiển thị trên màn hình bán hàng",
  [InventoryImportExcelField.DESCRIPTION]: "Mô tả",
  [InventoryImportExcelField.INACTIVE]: "Ngừng kinh doanh",
  [InventoryImportExcelField.SIZE_RANGE]: "Dãy size",
  [InventoryImportExcelField.INGREDIENT]: "Thành phần",
  [InventoryImportExcelField.YEAR_OF_PRODUCTION]: "Năm sản xuất",
  [InventoryImportExcelField.UNIT_PRICE_BOX]: "Giá thùng",
  [InventoryImportExcelField.UNIT_PRICE_WHOLE_SALE]: "Giá sỉ",
};

/** Full MISA template column order (43 fields). */
export const INVENTORY_IMPORT_EXCEL_COLUMN_ORDER: InventoryImportExcelField[] = [
  InventoryImportExcelField.SKU_CODE,
  InventoryImportExcelField.BAR_CODE,
  InventoryImportExcelField.MODEL_CODE,
  InventoryImportExcelField.MODEL_NAME,
  InventoryImportExcelField.INVENTORY_ITEM_NAME,
  InventoryImportExcelField.ITEM_CATEGORY_CODE,
  InventoryImportExcelField.ITEM_CATEGORY_NAME,
  InventoryImportExcelField.BRAND_NAME,
  InventoryImportExcelField.UNIT_NAME,
  InventoryImportExcelField.COLOR,
  InventoryImportExcelField.SIZE,
  InventoryImportExcelField.COST_PRICE,
  InventoryImportExcelField.UNIT_PRICE,
  InventoryImportExcelField.TAX_RATE,
  InventoryImportExcelField.OPENING_QUANTITY,
  InventoryImportExcelField.OPENING_AMOUNT,
  InventoryImportExcelField.OPENING_STOCK_NAME,
  InventoryImportExcelField.MINIMUM_STOCK,
  InventoryImportExcelField.MAXIMUM_STOCK,
  InventoryImportExcelField.UNIT_CONVERT_NAME,
  InventoryImportExcelField.UNIT_CONVERT_RATE,
  InventoryImportExcelField.UNIT_CONVERT_COST_PRICE,
  InventoryImportExcelField.UNIT_CONVERT_SALE_PRICE,
  InventoryImportExcelField.IS_SALE_UNIT,
  InventoryImportExcelField.IS_COST_UNIT,
  InventoryImportExcelField.IMAGE_URL,
  InventoryImportExcelField.HEIGHT,
  InventoryImportExcelField.WIDTH,
  InventoryImportExcelField.LENGTH,
  InventoryImportExcelField.WEIGHT,
  InventoryImportExcelField.SHOW_LOCATION,
  InventoryImportExcelField.STOCK_LOCATION,
  InventoryImportExcelField.IS_USE_LOT_NO,
  InventoryImportExcelField.SELL_BEFORE_DAY,
  InventoryImportExcelField.IS_USE_SERIAL,
  InventoryImportExcelField.SHOW_IN_MENU,
  InventoryImportExcelField.DESCRIPTION,
  InventoryImportExcelField.INACTIVE,
  InventoryImportExcelField.SIZE_RANGE,
  InventoryImportExcelField.INGREDIENT,
  InventoryImportExcelField.YEAR_OF_PRODUCTION,
  InventoryImportExcelField.UNIT_PRICE_BOX,
  InventoryImportExcelField.UNIT_PRICE_WHOLE_SALE,
];

/** MISA template file version row (sheet 1, row 1). */
export const INVENTORY_IMPORT_EXCEL_TEMPLATE_VERSION = "MS_030";

export interface InventoryImportExcelColumn {
  key: InventoryImportExcelField;
  label: string;
}

/** Column order + Vietnamese labels for Excel export/template workbooks. */
export const INVENTORY_IMPORT_EXCEL_COLUMNS: InventoryImportExcelColumn[] =
  INVENTORY_IMPORT_EXCEL_COLUMN_ORDER.map((key) => ({
    key,
    label: INVENTORY_IMPORT_EXCEL_FIELD_LABELS[key],
  }));

/** Columns exported as Excel number cells (not text). */
export const INVENTORY_IMPORT_EXCEL_NUMERIC_FIELDS: InventoryImportExcelField[] = [
  InventoryImportExcelField.COST_PRICE,
  InventoryImportExcelField.UNIT_PRICE,
  InventoryImportExcelField.TAX_RATE,
  InventoryImportExcelField.OPENING_QUANTITY,
  InventoryImportExcelField.OPENING_AMOUNT,
  InventoryImportExcelField.MINIMUM_STOCK,
  InventoryImportExcelField.MAXIMUM_STOCK,
  InventoryImportExcelField.UNIT_CONVERT_RATE,
  InventoryImportExcelField.UNIT_CONVERT_COST_PRICE,
  InventoryImportExcelField.UNIT_CONVERT_SALE_PRICE,
  InventoryImportExcelField.HEIGHT,
  InventoryImportExcelField.WIDTH,
  InventoryImportExcelField.LENGTH,
  InventoryImportExcelField.WEIGHT,
  InventoryImportExcelField.SELL_BEFORE_DAY,
  InventoryImportExcelField.YEAR_OF_PRODUCTION,
  InventoryImportExcelField.UNIT_PRICE_BOX,
  InventoryImportExcelField.UNIT_PRICE_WHOLE_SALE,
];

/** Grouped integer/money display (e.g. 350.000 in Vietnamese Excel). */
export const INVENTORY_IMPORT_EXCEL_NUMFMT_GROUPED = "#.##0";

/** Optional fractional values (tax %, cm/g with decimals). */
export const INVENTORY_IMPORT_EXCEL_NUMFMT_DECIMAL = "0.##";

/** MAP columns — committed to DB on import (MVP). */
export const INVENTORY_IMPORT_MVP_COMMIT_FIELDS: InventoryImportExcelField[] = [
  InventoryImportExcelField.SKU_CODE,
  InventoryImportExcelField.BAR_CODE,
  InventoryImportExcelField.MODEL_NAME,
  InventoryImportExcelField.INVENTORY_ITEM_NAME,
  InventoryImportExcelField.ITEM_CATEGORY_NAME,
  InventoryImportExcelField.BRAND_NAME,
  InventoryImportExcelField.UNIT_NAME,
  InventoryImportExcelField.COST_PRICE,
  InventoryImportExcelField.UNIT_PRICE,
  InventoryImportExcelField.IS_SALE_UNIT,
  InventoryImportExcelField.IS_COST_UNIT,
  InventoryImportExcelField.HEIGHT,
  InventoryImportExcelField.WIDTH,
  InventoryImportExcelField.LENGTH,
  InventoryImportExcelField.WEIGHT,
  InventoryImportExcelField.SHOW_IN_MENU,
  InventoryImportExcelField.INACTIVE,
  InventoryImportExcelField.SIZE_RANGE,
  InventoryImportExcelField.INGREDIENT,
  InventoryImportExcelField.YEAR_OF_PRODUCTION,
];

/** PARTIAL + GAP columns — stored in rawData only (MVP). */
export const INVENTORY_IMPORT_MVP_IGNORE_FIELDS: InventoryImportExcelField[] = [
  InventoryImportExcelField.MODEL_CODE,
  InventoryImportExcelField.ITEM_CATEGORY_CODE,
  InventoryImportExcelField.COLOR,
  InventoryImportExcelField.SIZE,
  InventoryImportExcelField.TAX_RATE,
  InventoryImportExcelField.OPENING_QUANTITY,
  InventoryImportExcelField.OPENING_AMOUNT,
  InventoryImportExcelField.OPENING_STOCK_NAME,
  InventoryImportExcelField.MINIMUM_STOCK,
  InventoryImportExcelField.MAXIMUM_STOCK,
  InventoryImportExcelField.UNIT_CONVERT_NAME,
  InventoryImportExcelField.UNIT_CONVERT_RATE,
  InventoryImportExcelField.UNIT_CONVERT_COST_PRICE,
  InventoryImportExcelField.UNIT_CONVERT_SALE_PRICE,
  InventoryImportExcelField.IMAGE_URL,
  InventoryImportExcelField.SHOW_LOCATION,
  InventoryImportExcelField.STOCK_LOCATION,
  InventoryImportExcelField.IS_USE_LOT_NO,
  InventoryImportExcelField.SELL_BEFORE_DAY,
  InventoryImportExcelField.IS_USE_SERIAL,
  InventoryImportExcelField.DESCRIPTION,
  InventoryImportExcelField.UNIT_PRICE_BOX,
  InventoryImportExcelField.UNIT_PRICE_WHOLE_SALE,
];

const MVP_FIELD_SET = new Set<InventoryImportExcelField>([
  ...INVENTORY_IMPORT_MVP_COMMIT_FIELDS,
  ...INVENTORY_IMPORT_MVP_IGNORE_FIELDS,
]);

/** All MVP import columns in template column order (commit + ignore/raw-only). */
export const INVENTORY_IMPORT_MVP_FIELDS: InventoryImportExcelField[] =
  INVENTORY_IMPORT_EXCEL_COLUMN_ORDER.filter((field) => MVP_FIELD_SET.has(field));

export enum ImportDuplicateMode {
  UPDATE = "UPDATE",
  SKIP = "SKIP",
}

export enum ImportRowStatus {
  VALID = "VALID",
  ERROR = "ERROR",
  COMMITTED = "COMMITTED",
}

export function parseImportDuplicateMode(
  value: string | undefined,
): ImportDuplicateMode {
  const normalized = (value ?? ImportDuplicateMode.UPDATE).toUpperCase();
  if (normalized === ImportDuplicateMode.SKIP) {
    return ImportDuplicateMode.SKIP;
  }
  return ImportDuplicateMode.UPDATE;
}

export const IMPORT_DUPLICATE_MODE_LABELS: Record<ImportDuplicateMode, string> = {
  [ImportDuplicateMode.UPDATE]: "Cập nhật",
  [ImportDuplicateMode.SKIP]: "Bỏ qua",
};

export type InventoryImportExcelRow = Record<string, string>;

/** Rows persisted per INSERT when saving import job rows (jsonb payloads). */
export const INVENTORY_IMPORT_ROW_SAVE_BATCH_SIZE = 100;

/** Rows validated in memory before flushing to DB. */
export const INVENTORY_IMPORT_VALIDATE_BATCH_SIZE = 500;

/** SKU codes loaded per `WHERE code IN (...)` when checking duplicates (SKIP mode). */
export const INVENTORY_IMPORT_SKU_LOOKUP_BATCH_SIZE = 1000;

/** Max rows returned to the client after validate/commit (errors first, then valid). */
export const INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT = 200;
