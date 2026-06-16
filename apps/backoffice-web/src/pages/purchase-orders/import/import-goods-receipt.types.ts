import { ImportRowStatus } from "@erp/shared-interfaces";
import { ImportWizardStep } from "../../inventory/_components/import/import-inventory.types";

export { ImportRowStatus, ImportWizardStep };

export interface GoodsReceiptImportMessage {
  column?: string;
  code: string;
  message: string;
}

export interface GoodsReceiptImportNormalizedData {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  storageId: string;
  storageName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantity: number;
  unitPrice: number;
  note: string;
}

export interface GoodsReceiptImportJobRow {
  id: string;
  jobId: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData?: GoodsReceiptImportNormalizedData;
  status: ImportRowStatus;
  errorMessages?: GoodsReceiptImportMessage[];
  warningMessages?: GoodsReceiptImportMessage[];
}

export interface GoodsReceiptImportJob {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
}

export interface GoodsReceiptImportValidateResponse {
  job: GoodsReceiptImportJob;
  rows: GoodsReceiptImportJobRow[];
  rowsTruncated?: boolean;
}
