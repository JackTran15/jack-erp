import type { BarcodePaperConfig } from "./barcode-print-settings.interface";

/** Khổ mặc định: giấy in tem 2 cột 104×23mm (theo spec màn hình in tem). */
export const DEFAULT_PAPER_CONFIG: BarcodePaperConfig = {
  marginTop: 1.05,
  marginBottom: 1.5,
  marginLeft: 2,
  marginRight: 2,
  paperHeight: 23,
  paperWidth: 104,
  columnWidth: 50,
  // Khe giữa 2 tem trong một hàng — 2 + 2×50 + 1.5 = 103.5 ≤ 104 nên vẫn xếp 2 tem/hàng.
  columnGap: 1.5,
};
