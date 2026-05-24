export enum CashCountStatusEnum {
  UNPROCESSED = "UNPROCESSED",
  PROCESSED = "PROCESSED",
}

export interface CashCountDenominationLine {
  denomination: number;
  quantity: number;
  amount: number;
  description: string;
}

export interface CashCountParticipant {
  fullName: string;
  title: string;
  representative: string;
}

export interface CashCountRecord {
  id: string;
  documentNumber: string;
  countDate: string;
  inventoryUntilDate: string;
  countTime: string;
  purpose: string;
  reference?: string;
  status: CashCountStatusEnum;
  lines: CashCountDenominationLine[];
  participants: CashCountParticipant[];
  actualAmount: number;
  bookBalance: number;
  variance: number;
  conclusion: string;
}

export enum CashCountDialogModeEnum {
  CREATE = "CREATE",
  VIEW = "VIEW",
  EDIT = "EDIT",
}

export interface CashCountCreateDraft {
  inventoryUntilDate: string;
}

export type CashCountLinePatch = Partial<
  Pick<CashCountDenominationLine, "quantity" | "description">
>;
