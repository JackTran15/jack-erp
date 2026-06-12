import { ImportRowStatus } from "@erp/shared-interfaces";
import {
  ImportWizardStep,
  IMPORT_WIZARD_STEP_TITLES,
} from "../../../inventory/_components/import/import-inventory.types";

export { ImportRowStatus, ImportWizardStep, IMPORT_WIZARD_STEP_TITLES };

export interface StockTakeImportRowError {
  column?: string;
  code: string;
  message: string;
}

export type StockTakeImportRawData = Record<string, unknown>;

export interface StockTakeImportJobRow {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: StockTakeImportRawData;
  status: ImportRowStatus;
  errorMessages?: StockTakeImportRowError[];
}

export interface StockTakeImportJob {
  id: string;
  type: "STOCK_TAKE" | string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  referenceId?: string | null;
}

export interface StockTakeImportValidateResponse {
  job: StockTakeImportJob;
  rows: StockTakeImportJobRow[];
  rowsTruncated?: boolean;
}

export interface StockTakeImportCommitResponse extends StockTakeImportValidateResponse {
  productsCreated: number;
  itemsCommitted: number;
}

export interface StockTakeImportReviewRow extends StockTakeImportJobRow {
  isError: boolean;
  statusLabel: string;
}
