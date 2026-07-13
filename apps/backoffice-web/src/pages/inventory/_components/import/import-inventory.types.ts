/**
 * Wizard types were promoted to the shared import-wizard module; this shim
 * keeps the existing per-page import paths working.
 */
export {
  ImportDuplicateMode,
  ImportRowStatus,
  ImportWizardStep,
  IMPORT_WIZARD_STEP_TITLES,
  toImportReviewRows,
} from "../../../../components/shared/import-wizard/types";
export type {
  InventoryImportExcelRow,
  ImportRowError,
  ImportJobRow,
  ImportJob,
  ImportValidateResponse,
  ImportReviewRow,
} from "../../../../components/shared/import-wizard/types";

import type { ImportValidateResponse as SharedImportValidateResponse } from "../../../../components/shared/import-wizard/types";

export interface ImportCommitResponse extends SharedImportValidateResponse {
  productsCreated: number;
  itemsCommitted: number;
}
