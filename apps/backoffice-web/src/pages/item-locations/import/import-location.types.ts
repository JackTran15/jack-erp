import { ImportDuplicateMode, ImportRowStatus } from "@erp/shared-interfaces";
import { ImportWizardStep } from "../../inventory/_components/import/import-inventory.types";

export { ImportDuplicateMode, ImportRowStatus, ImportWizardStep };

export interface LocationImportRow {
  LocationCode: string;
  LocationName: string;
  StorageName: string;
  LocationType?: string;
}

export interface ImportRowError {
  column?: string;
  code: string;
  message: string;
}

export interface LocationImportJobRow {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: LocationImportRow;
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

export interface LocationImportValidateResponse {
  job: ImportJob;
  rows: LocationImportJobRow[];
  rowsTruncated?: boolean;
}

export interface LocationImportCommitResponse {
  job: ImportJob;
  locationsCommitted: number;
}
