import { ImportRowStatus } from "@erp/shared-interfaces";
import { ImportWizardStep } from "../import/import-inventory.types";

export { ImportRowStatus, ImportWizardStep };

export type DocumentLineImportKind =
  | "goods-issues"
  | "stock-transfers"
  | "transfer-orders";

export interface DocumentLineImportMessage {
  column?: string;
  code: string;
  message: string;
}

export interface DocumentLineImportNormalizedData {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice?: number;
  note: string;
  storageId?: string;
  storageName?: string;
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  sourceStorageId?: string;
  sourceStorageName?: string;
  sourceLocationId?: string;
  sourceLocationCode?: string;
  sourceLocationName?: string;
  destinationStorageId?: string;
  destinationStorageName?: string;
  destinationLocationId?: string;
  destinationLocationCode?: string;
  destinationLocationName?: string;
}

export interface DocumentLineImportJobRow {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData?: DocumentLineImportNormalizedData;
  status: ImportRowStatus;
  errorMessages?: DocumentLineImportMessage[];
  warningMessages?: DocumentLineImportMessage[];
}

export interface DocumentLineImportJob {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
}

export interface DocumentLineImportValidateResponse {
  job: DocumentLineImportJob;
  rows: DocumentLineImportJobRow[];
  rowsTruncated?: boolean;
}
