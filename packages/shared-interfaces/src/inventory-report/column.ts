import { ReportFilterOption } from '../invoice-report/options';

/**
 * Backend report keys of the 8 inventory reports (InventoryReportDefinition.key).
 * FE maps its REPORT_TYPE_INVENTORY enum values onto these via `backendKey`.
 */
export const INVENTORY_REPORT_KEYS = {
  STOCK_SUMMARY: 'inventory-stock-summary',
  DOCUMENT_DETAIL: 'inventory-document-detail',
  STOCK_QUANTITY_DETAIL: 'inventory-stock-quantity-detail',
  STOCK_SUMMARY_BY_STORE: 'inventory-stock-summary-by-store',
  STOCK_BY_STORE_PIVOT: 'inventory-stock-by-store-pivot',
  TRANSFER_SUMMARY: 'inventory-transfer-summary',
  TRANSFER_BY_STORE: 'inventory-transfer-by-store',
  TEMP_WAREHOUSE_OUT: 'inventory-temp-warehouse-out',
} as const;

export type InventoryReportKey =
  (typeof INVENTORY_REPORT_KEYS)[keyof typeof INVENTORY_REPORT_KEYS];

/** Vietnamese display names of the inventory report types. */
export const INVENTORY_REPORT_TYPE_LABELS_VI: Record<InventoryReportKey, string> = {
  'inventory-stock-summary': 'Tổng hợp nhập xuất tồn kho',
  'inventory-document-detail': 'Bảng kê chi tiết phiếu nhập xuất kho',
  'inventory-stock-quantity-detail': 'Chi tiết số lượng nhập xuất tồn kho',
  'inventory-stock-summary-by-store': 'Tổng hợp nhập xuất tồn kho theo cửa hàng',
  'inventory-stock-by-store-pivot': 'Số lượng tồn kho theo cửa hàng',
  'inventory-transfer-summary': 'Tổng hợp nhập xuất điều chuyển',
  'inventory-transfer-by-store': 'Tổng hợp hàng hóa đã điều chuyển theo cửa hàng',
  'inventory-temp-warehouse-out': 'Hàng hóa xuất kho tạm',
};

/**
 * Vietnamese labels for the FIXED columns, PER REPORT. Unlike the invoice
 * flat map, several inventory column keys carry different labels depending
 * on the report (e.g. `openingQty` is "Số lượng" under the "Tồn đầu kỳ" band
 * in the stock summary, but the standalone "Tồn đầu kỳ" column in the
 * quantity-detail report), so each report owns its own map.
 * Keys MUST match the FE registry/table keys (report-registry/*.registry.ts).
 */
export const INVENTORY_REPORT_COLUMN_LABELS_VI: Record<
  InventoryReportKey,
  Record<string, string>
> = {
  'inventory-stock-summary': {
    name: 'Tên hàng hóa',
    parentSku: 'Mã SKU mẫu mã',
    parentName: 'Tên Mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    unit: 'Đơn vị tính',
    group: 'Nhóm hàng hóa',
    brand: 'Thương hiệu',
    sku: 'Mã SKU',
    positionCode: 'Mã vị trí',
    positionName: 'Tên vị trí',
    openingQty: 'Số lượng',
    openingValue: 'Giá trị',
    inQty: 'Số lượng',
    inValue: 'Giá trị',
    outQty: 'Số lượng',
    outValue: 'Giá trị',
    endingQty: 'Số lượng',
    endingValue: 'Giá trị',
    transferOutQty: 'Số lượng',
    transferOutValue: 'Giá trị',
    incomingQty: 'Số lượng',
    incomingValue: 'Giá trị',
    supplier: 'Nhà cung cấp',
  },
  'inventory-document-detail': {
    date: 'Ngày chứng từ',
    documentType: 'Loại chứng từ',
    warehouse: 'Kho',
    documentNumber: 'Số chứng từ',
    reference: 'Tham chiếu',
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    unit: 'Đơn vị tính',
    notes: 'Ghi chú hàng hóa',
    group: 'Nhóm hàng hóa',
    parentSku: 'SKU mẫu mã',
    parentName: 'Tên mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    inQty: 'Số lượng',
    inUnitPrice: 'Đơn giá',
    inValue: 'Giá trị',
    inSalePrice: 'Giá bán',
    outQty: 'Số lượng',
    outUnitPrice: 'Đơn giá',
    outValue: 'Giá trị',
    outSalePrice: 'Giá bán',
    customer: 'Đối tượng',
    branchCode: 'Mã cửa hàng',
    branchName: 'Tên cửa hàng',
    receiverBranchCode: 'Mã cửa hàng nhận',
    receiverBranchName: 'Tên cửa hàng nhận',
  },
  'inventory-stock-quantity-detail': {
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    parentSku: 'Mã SKU mẫu mã',
    parentName: 'Tên Mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    unit: 'Đơn vị tính',
    group: 'Nhóm hàng hóa',
    brand: 'Thương hiệu',
    openingQty: 'Tồn đầu kỳ',
    inTotal: 'Tổng',
    inPurchase: 'Mua hàng',
    inTransfer: 'Điều chuyển',
    inReturn: 'Hàng trả lại',
    inWh: 'Chuyển kho',
    inAdjust: 'Kiểm kê',
    inOther: 'Khác',
    outTotal: 'Tổng',
    outSale: 'Bán hàng',
    outTransfer: 'Điều chuyển',
    outPurchaseReturn: 'Trả lại hàng mua',
    outWh: 'Chuyển kho',
    outAdjust: 'Kiểm kê',
    outVoid: 'Hủy hàng',
    outOther: 'Khác',
    endingQty: 'Tồn cuối kỳ',
  },
  'inventory-stock-summary-by-store': {
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    parentSku: 'Mã SKU mẫu mã',
    parentName: 'Tên Mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    unit: 'Đơn vị tính',
    group: 'Nhóm hàng hóa',
    brand: 'Thương hiệu',
    branchCode: 'Mã cửa hàng',
    branch: 'Tên cửa hàng',
    openingQty: 'Số lượng',
    openingValue: 'Giá trị',
    inQty: 'Số lượng',
    inValue: 'Giá trị',
    outQty: 'Số lượng',
    outValue: 'Giá trị',
    endingQty: 'Số lượng',
    endingValue: 'Giá trị',
  },
  'inventory-stock-by-store-pivot': {
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    parentSku: 'Mã SKU mẫu mã',
    parentName: 'Tên Mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    unit: 'Đơn vị tính',
    group: 'Nhóm hàng hóa',
    brand: 'Thương hiệu',
    total: 'Tồn cuối kỳ',
    // Dynamic per-branch columns (`branch.qty.<branchId>`) take the branch
    // name as their label — resolved by the backend catalog, not this map.
  },
  'inventory-transfer-summary': {
    branchCode: 'Mã cửa hàng',
    branchName: 'Tên cửa hàng',
    inQty: 'Số lượng',
    inValue: 'Giá trị',
    outQty: 'Số lượng',
    outValue: 'Giá trị',
    receivedQty: 'Số lượng',
    receivedValue: 'Giá trị',
    diffQty: 'Số lượng',
    diffValue: 'Giá trị',
    inOutDiffQty: 'Số lượng',
    inOutDiffValue: 'Giá trị',
  },
  'inventory-transfer-by-store': {
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    parentSku: 'Mã SKU mẫu mã',
    parentName: 'Tên Mẫu mã',
    color: 'Màu sắc',
    size: 'Size',
    unit: 'Đơn vị tính',
    group: 'Nhóm hàng hóa',
    brand: 'Thương hiệu',
    targetBranch: 'Cửa hàng nhận điều chuyển',
    outQty: 'Số lượng xuất',
    outAvgPrice: 'Đơn giá xuất trung bình',
    outValue: 'Giá trị xuất',
    inQty: 'Số lượng nhập',
    inAvgPrice: 'Đơn giá nhập trung bình',
    inValue: 'Giá trị nhập',
  },
  'inventory-temp-warehouse-out': {
    sku: 'Mã SKU',
    name: 'Tên hàng hóa',
    unit: 'Đơn vị tính',
    location: 'Mã vị trí',
    date: 'Ngày xuất',
    time: 'Giờ xuất',
    staff: 'Nhân viên xuất',
    outQty: 'SL xuất',
    returnQty: 'SL trả',
    saleQty: 'SL bán',
    remainingQty: 'SL tồn',
    status: 'Trạng thái',
    invoice: 'Hóa đơn bán',
  },
};

/**
 * Vietnamese band (two-tier header group) labels, PER REPORT — the same band
 * id means different things per report (e.g. `in` is "Nhập trong kỳ" for
 * stock-period reports but "Nhập kho điều chuyển" for the transfer summary).
 */
export const INVENTORY_REPORT_BAND_LABELS_VI: Record<
  string,
  Record<string, string>
> = {
  'inventory-stock-summary': {
    opening: 'Tồn đầu kỳ',
    in: 'Nhập trong kỳ',
    out: 'Xuất trong kỳ',
    ending: 'Tồn cuối kỳ',
    transferOut: 'Đang chuyển đi',
    incoming: 'Sắp nhận về',
  },
  'inventory-document-detail': {
    in: 'Nhập kho',
    out: 'Xuất kho',
  },
  'inventory-stock-quantity-detail': {
    in: 'Nhập trong kỳ',
    out: 'Xuất trong kỳ',
  },
  'inventory-stock-summary-by-store': {
    opening: 'Tồn đầu kỳ',
    in: 'Nhập trong kỳ',
    out: 'Xuất trong kỳ',
    ending: 'Tồn cuối kỳ',
  },
  'inventory-stock-by-store-pivot': {
    perBranch: 'Tồn theo cửa hàng',
  },
  'inventory-transfer-summary': {
    in: 'Nhập kho điều chuyển',
    out: 'Xuất kho điều chuyển',
    received: 'Cửa hàng khác thực nhận về',
    diff: 'Chênh lệch thực nhận',
    inOutDiff: 'Chênh lệch nhập xuất điều chuyển',
  },
};

/** Vietnamese labels of the stock document kinds (document-detail report). */
export const INVENTORY_DOC_KIND_LABELS_VI: Record<string, string> = {
  GOODS_RECEIPT: 'Phiếu nhập kho mua hàng',
  GOODS_ISSUE: 'Phiếu xuất kho bán hàng',
  STOCK_TRANSFER: 'Phiếu điều chuyển kho',
};

/**
 * Status values of the temp-warehouse-out report's `status` select filter.
 * Values are the literal strings the report engine emits (legacy VI values).
 */
export const TEMP_WAREHOUSE_OUT_STATUS_OPTIONS: ReportFilterOption[] = [
  { value: 'Xuất không bán', label: 'Xuất không bán' },
  { value: 'Trả hàng trưng bày', label: 'Trả hàng trưng bày' },
];

/** Dynamic per-branch pivot column key: `branch.qty.<branchId>`. */
export const INVENTORY_BRANCH_QTY_COLUMN_PREFIX = 'branch.qty.';

export function branchQtyColumnKey(branchId: string): string {
  return `${INVENTORY_BRANCH_QTY_COLUMN_PREFIX}${branchId}`;
}

/** Returns the branchId of a `branch.qty.<branchId>` key, or null. */
export function parseBranchQtyColumnKey(col: string): string | null {
  if (!col.startsWith(INVENTORY_BRANCH_QTY_COLUMN_PREFIX)) return null;
  const id = col.slice(INVENTORY_BRANCH_QTY_COLUMN_PREFIX.length);
  return id.length > 0 ? id : null;
}
