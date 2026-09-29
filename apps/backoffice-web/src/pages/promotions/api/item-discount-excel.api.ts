import { PromotionDiscountMode, PromotionTargetType } from "@erp/shared-interfaces";
import { apiClient } from "../../../lib/api-axios";
import { triggerBlobDownload } from "../../../lib/download";

/** Phương thức có Nhập/Xuất khẩu — mỗi phương thức ứng với một sheet trong file. */
export type ItemDiscountExcelMethod =
  | PromotionDiscountMode.PERCENT
  | PromotionDiscountMode.AMOUNT
  | PromotionDiscountMode.FIXED_PRICE;

export interface ItemDiscountExcelLine {
  targetType: PromotionTargetType;
  targetId: string;
  value: number | "";
}

/**
 * Xuất khẩu các dòng đang có trên lưới (kể cả chưa lưu) ra Excel 3 sheet (A-07):
 * sheet của `method` chứa mã/tên (backend đọc lại theo tổ chức), hai sheet kia chỉ
 * có tiêu đề. `lines: []` → file mẫu, cả 3 sheet chỉ có tiêu đề.
 */
export async function downloadItemDiscountExcel(
  method: ItemDiscountExcelMethod,
  lines: ItemDiscountExcelLine[],
): Promise<void> {
  const { data } = await apiClient.post<Blob>(
    "/v2/promotions/item-discount-lines/export",
    {
      method,
      lines: lines.map((l) => ({
        targetType: l.targetType,
        targetId: l.targetId,
        ...(l.value === "" ? {} : { value: l.value }),
      })),
    },
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "GiamGiaHangHoa.xlsx");
}

/** Một dòng hợp lệ trong file nhập khẩu, đã tra mã theo tổ chức. */
export interface ImportedItemDiscountLine {
  rowNumber: number;
  targetType: PromotionTargetType.ITEM | PromotionTargetType.PRODUCT;
  targetId: string;
  code: string;
  name: string;
  /** Không có khi nhập *Đồng giá* — giá dùng chung ở hàng Thiết lập (A-09). */
  value?: number;
  /** Chỉ có ở dòng `ITEM` (A-14). */
  unit?: string;
  sellingPrice?: number;
}

/** Một dòng lỗi — `rowNumber` là số dòng Excel (tiêu đề = 1). */
export interface ImportItemDiscountRowError {
  rowNumber: number;
  code?: string;
  message: string;
}

export interface ImportItemDiscountLinesResult {
  rows: ImportedItemDiscountLine[];
  errors: ImportItemDiscountRowError[];
}

/**
 * Đọc file Excel và kiểm tra từng dòng ở backend. Không ghi gì — kết quả chỉ để
 * gộp vào lưới; người dùng bấm Lưu thì chương trình mới được lưu.
 */
export async function importItemDiscountExcel(
  method: ItemDiscountExcelMethod,
  file: File,
): Promise<ImportItemDiscountLinesResult> {
  const body = new FormData();
  body.append("file", file);
  body.append("method", method);
  const { data } = await apiClient.post<ImportItemDiscountLinesResult>(
    "/v2/promotions/item-discount-lines/import",
    body,
  );
  return data;
}
