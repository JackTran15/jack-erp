import type { BarcodePaperConfig } from "../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.interface";

/** Mã đợt in trên tem: MMYY tại thời điểm in (07/2026 → "0726"). */
export function formatBatchCode(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  return `${mm}${yy}`;
}

export interface RenderLabelsSettings {
  paper: BarcodePaperConfig;
  /** Thời điểm in — nguồn của mã MMYY trên tem. */
  printedAt: Date;
  /** Mã chi nhánh in ở cột phải của tem (vd "CM"). */
  branchCode: string;
  /** Hiện thông tin gắn với cửa hàng (mã chi nhánh + vị trí). Tắt ở chuỗi cửa hàng. */
  showStoreInfo: boolean;
}

/**
 * Số tem xếp được trên một hàng ngang: đếm từ lề trái tới hết bề rộng giấy.
 * Lề phải chỉ là khoảng canh in (không trừ vào số cột) — nhờ vậy khổ mặc định
 * 104mm lề 2mm vẫn xếp được 2 cột 50mm (2 + 2×50 + 0.3 = 102.3 ≤ 104).
 */
export function labelsPerRow(paper: BarcodePaperConfig): number {
  const usable = paper.paperWidth - paper.marginLeft;
  return Math.max(
    1,
    Math.floor((usable + paper.columnGap) / (paper.columnWidth + paper.columnGap)),
  );
}
