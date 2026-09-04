import type { ReportColumnConfig, ReportTableConfig } from "../report.interface";

/**
 * L2 — "Chi tiết phiếu nhập xuất điều chuyển theo cửa hàng và chứng từ".
 *
 * Chỉ mở từ dialog L1; không nằm trong `STORAGE_REPORTS`. Đây là bản dự phòng
 * cho nhánh `ReportTableConfigSync` chưa có catalog backend — catalog mới là
 * nguồn thật.
 */
let order = 0;
const col = (
  column: string,
  label: string,
  width: number,
  dataType: "text" | "number" | "date" = "text",
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: {
    width,
    dataType,
    ...(dataType === "number" ? { align: "right" as const } : {}),
  },
});

const columns: ReportColumnConfig[] = [
  col("date", "Ngày chứng từ", 120, "date"),
  col("documentNumber", "Số chứng từ", 130),
  col("referenceDate", "Ngày chứng từ tham chiếu", 150, "date"),
  col("reference", "Tham chiếu", 130),
  col("warehouse", "Kho", 150),
  col("sku", "Mã SKU", 150),
  col("name", "Tên hàng hóa", 240),
  col("unit", "Đơn vị tính", 100),
  col("qty", "Số lượng", 100, "number"),
  col("unitPrice", "Đơn giá", 120, "number"),
  col("value", "Giá trị", 130, "number"),
  col("parentSku", "SKU mẫu mã", 140),
  col("parentName", "Tên mẫu mã", 160),
  col("group", "Nhóm hàng", 150),
  col("counterparty", "Đối tượng", 180),
  col("notes", "Diễn giải", 220),
];
// Ghim hai cột đầu, khớp catalog backend. Registry này chỉ dùng khi API
// `columns` trả rỗng, nhưng để lệch với catalog là loại drift chỉ lộ một
// lần, trong dialog, không kèm lỗi nào.
columns[0].tableConfig!.pinned = "left";
columns[1].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportTransferDetailByDocument = tableConfig;
export const chain_tableRegistryReportTransferDetailByDocument = tableConfig;
export const single_filterRegistryReportTransferDetailByDocument = [];
export const chain_filterRegistryReportTransferDetailByDocument = [];
