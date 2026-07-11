import type {
  ImportJob,
  ImportJobRow,
  ImportRowError,
  ImportValidateResponse,
} from "../../../inventory/_components/import/import-inventory.types";

export type { ImportJob, ImportJobRow, ImportRowError, ImportValidateResponse };

export interface CustomerImportCommitResponse extends ImportValidateResponse {
  customersCreated: number;
  customersUpdated: number;
}
