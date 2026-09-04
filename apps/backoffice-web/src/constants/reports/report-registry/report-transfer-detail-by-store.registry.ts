import type { ReportColumnConfig, ReportTableConfig } from "../report.interface";

/**
 * L1 của drill-down điều chuyển — "Chi tiết nhập xuất điều chuyển theo cửa hàng".
 *
 * Chỉ mở từ dialog: không nằm trong `STORAGE_REPORTS` nên không xuất hiện ở ô
 * chọn báo cáo. Cột trùng hệt báo cáo cha vì đây chính là báo cáo cha chạy lại
 * cho một chi nhánh neo — khác cột thì dòng Tổng của dialog không còn đối chiếu
 * được bằng mắt với dòng vừa click.
 *
 * `link: true` ở đây chỉ phục vụ nhánh fallback: khi API `columns` trả về dữ
 * liệu thì `ReportTableConfigSync` ghi đè toàn bộ config này bằng catalog của
 * backend, và catalog mới là nguồn thật (xem `inventory-report-column.util.ts`).
 */
let order = 0;
const txt = (
  column: string,
  label: string,
  width: number,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "text" },
});
const num = (
  column: string,
  label: string,
  width: number,
  group: string,
  link = false,
): ReportColumnConfig => ({
  column,
  backendField: column,
  label,
  group,
  order: ++order,
  visible: true,
  tableConfig: { width, dataType: "number", align: "right", ...(link ? { link: true } : {}) },
});

const G_IN = "Nhập kho điều chuyển";
const G_OUT = "Xuất kho điều chuyển";
const G_RECEIVED = "Cửa hàng khác thực nhận về";
const G_DIFF = "Chênh lệch thực nhận";
const G_INOUT = "Chênh lệch nhập xuất điều chuyển";

const columns: ReportColumnConfig[] = [
  txt("branchCode", "Mã cửa hàng", 130),
  txt("branchName", "Tên cửa hàng", 220),
  num("inQty", "Số lượng", 110, G_IN, true),
  num("inValue", "Giá trị", 130, G_IN),
  num("outQty", "Số lượng", 110, G_OUT, true),
  num("outValue", "Giá trị", 130, G_OUT),
  num("receivedQty", "Số lượng", 110, G_RECEIVED, true),
  num("receivedValue", "Giá trị", 130, G_RECEIVED),
  num("diffQty", "Số lượng", 110, G_DIFF, true),
  num("diffValue", "Giá trị", 130, G_DIFF),
  num("inOutDiffQty", "Số lượng", 110, G_INOUT),
  num("inOutDiffValue", "Giá trị", 130, G_INOUT),
];
// Ghim hai cột đầu, khớp catalog backend. Registry này chỉ dùng khi API
// `columns` trả rỗng, nhưng để lệch với catalog là loại drift chỉ lộ một
// lần, trong dialog, không kèm lỗi nào.
columns[0].tableConfig!.pinned = "left";
columns[1].tableConfig!.pinned = "left";

const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns };
export const single_tableRegistryReportTransferDetailByStore = tableConfig;
export const chain_tableRegistryReportTransferDetailByStore = tableConfig;

/** Dialog không render form filter — phạm vi do dòng vừa click quyết định. */
export const single_filterRegistryReportTransferDetailByStore = [];
export const chain_filterRegistryReportTransferDetailByStore = [];
