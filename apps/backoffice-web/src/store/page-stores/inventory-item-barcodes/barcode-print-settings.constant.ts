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
  columnGap: 0.3,
};
