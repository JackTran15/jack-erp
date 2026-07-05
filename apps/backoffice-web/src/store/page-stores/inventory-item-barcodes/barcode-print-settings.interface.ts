export type BarcodeStandard = "CODE128" | "EAN13";

/** Khổ giấy in tem, mọi giá trị tính bằng mm. */
export interface BarcodePaperConfig {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Cao khổ giấy. */
  paperHeight: number;
  /** Rộng khổ giấy. */
  paperWidth: number;
  /** Độ rộng mỗi cột tem. */
  columnWidth: number;
  /** Khoảng cách giữa các cột tem. */
  columnGap: number;
}

export interface BarcodePrintSettingsState {
  standard: BarcodeStandard;
  /** In "Đơn vị tính" lên tem. */
  showUnit: boolean;
  paper: BarcodePaperConfig;
  setStandard: (standard: BarcodeStandard) => void;
  setShowUnit: (showUnit: boolean) => void;
  setPaper: (patch: Partial<BarcodePaperConfig>) => void;
  resetPaper: () => void;
}
