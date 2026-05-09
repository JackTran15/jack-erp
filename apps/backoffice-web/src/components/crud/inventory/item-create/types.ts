import type { Dispatch, SetStateAction } from "react";
import type { FieldDefinition } from "@erp/shared-interfaces";

export interface CommissionRow {
  id: string;
  position: string;
  method: string;
  amount: string;
  discountLimit: string;
}

/** Local-only placeholder fields shown on form. */
export interface FormExtras {
  initialStock: string;
  initialStockUnitPrice: string;
  showOnPos: boolean;
  manageBarcodePerUnit: boolean;
  attrColor: string;
  attrSize: string;
  weightG: string;
  pkgLength: string;
  pkgWidth: string;
  pkgHeight: string;
  oddSize: string;
  composition: string;
  yearMade: string;
  isGoldSilver: boolean;
  longDescription: string;
  minStock: string;
  maxStock: string;
  commissions: CommissionRow[];
}

export interface InventoryItemCreateFormProps {
  editableFields: FieldDefinition[];
  values: Record<string, unknown>;
  setValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  errors: Record<string, string>;
  setErrors: Dispatch<SetStateAction<Record<string, string>>>;
  entityKey: string;
  isSaving?: boolean;
}
