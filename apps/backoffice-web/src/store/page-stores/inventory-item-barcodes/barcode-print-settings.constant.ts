import type { BarcodePaperConfig } from "./barcode-print-settings.interface";

/** Khổ mặc định: giấy in tem 2 cột 104×23mm (theo spec màn hình in tem). */
export const DEFAULT_PAPER_CONFIG: BarcodePaperConfig = {
  marginTop: 1.05,
  marginBottom: 1.5,
  marginLeft: 1,
  marginRight: 1,
  paperHeight: 23,
  paperWidth: 104,
  columnWidth: 50,
  // Khe giữa 2 tem trong một hàng — 1 + 2×50 + 2 = 103 ≤ 104 nên vẫn xếp 2 tem/hàng.
  columnGap: 2,
};
