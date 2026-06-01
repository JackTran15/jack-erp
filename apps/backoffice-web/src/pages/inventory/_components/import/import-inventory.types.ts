import {
  ImportDuplicateMode,
  ImportRowStatus,
  type InventoryImportExcelRow,
} from "@erp/shared-interfaces";

export { ImportDuplicateMode, ImportRowStatus };
export type { InventoryImportExcelRow };

export enum ImportWizardStep {
  FileSelect = "file-select",
  DataReview = "data-review",
  Complete = "complete",
}

export const IMPORT_WIZARD_STEP_TITLES: Record<ImportWizardStep, string> = {
  [ImportWizardStep.FileSelect]: "Chọn tệp nguồn",
  [ImportWizardStep.DataReview]: "Kiểm tra dữ liệu",
  [ImportWizardStep.Complete]: "Hoàn thành",
};

export interface ImportRowError {
  column?: string;
  code: string;
  message: string;
}

export interface ImportJobRow {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: InventoryImportExcelRow;
  status: ImportRowStatus;
  errorMessages?: ImportRowError[];
}

export interface ImportJob {
  id: string;
  type: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateMode: ImportDuplicateMode;
}

export interface ImportValidateResponse {
  job: ImportJob;
  rows: ImportJobRow[];
  /** API chỉ trả tối đa ~200 dòng xem trước khi file lớn; dữ liệu đầy đủ nằm trên server theo job.id */
  rowsTruncated?: boolean;
}

export interface ImportCommitResponse extends ImportValidateResponse {
  productsCreated: number;
  itemsCommitted: number;
}

export interface ImportReviewRow extends ImportJobRow {
  statusLabel: string;
  isError: boolean;
}
