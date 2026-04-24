export enum StockMovementType {
  SALE_ISSUE = 'SALE_ISSUE',
  RETURN_IN = 'RETURN_IN',
  EXCHANGE_IN = 'EXCHANGE_IN',
  EXCHANGE_OUT = 'EXCHANGE_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  ADJUSTMENT_INCREASE = 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE = 'ADJUSTMENT_DECREASE',
  PURCHASE_RECEIPT = 'PURCHASE_RECEIPT',
}

export enum TransferStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum ImportJobStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  IMPORTING = 'IMPORTING',
  COMMITTING = 'COMMITTING',
  COMMITTED = 'COMMITTED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum LocationType {
  SHELF = 'SHELF',
  RACK = 'RACK',
  BIN = 'BIN',
  ZONE = 'ZONE',
}

export interface Item {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Storage {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  isMainStorage: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Showroom {
  id: string;
  organizationId: string;
  branchId: string;
  storageId: string;
  name: string;
  isMainShowroom: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Location {
  id: string;
  organizationId: string;
  branchId: string;
  storageId: string;
  code: string;
  name: string;
  type: LocationType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StorageManagerAssignment {
  id: string;
  userId: string;
  branchId: string;
  storageId: string;
  organizationId: string;
  assignedAt: string;
  assignedBy: string;
}

export interface StockBalance {
  id: string;
  organizationId: string;
  branchId: string;
  itemId: string;
  locationId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StockLedgerEntry {
  id: string;
  organizationId: string;
  branchId: string;
  itemId: string;
  locationId: string;
  movementType: StockMovementType;
  quantity: number;
  referenceId: string;
  referenceType: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StockTransfer {
  id: string;
  organizationId: string;
  branchId?: string;
  fromLocationId: string;
  toLocationId: string;
  status: TransferStatus;
  lines: StockTransferLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StockTransferLine {
  id: string;
  transferId: string;
  itemId: string;
  quantity: number;
}

export interface StockAdjustment {
  id: string;
  organizationId: string;
  branchId: string;
  locationId: string;
  status: TransferStatus;
  reason: string;
  lines: StockAdjustmentLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface StockAdjustmentLine {
  id: string;
  adjustmentId: string;
  itemId: string;
  quantityChange: number;
}

export interface ImportJob {
  id: string;
  organizationId: string;
  branchId: string;
  status: ImportJobStatus;
  fileName: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface ImportJobRow {
  id: string;
  importJobId: string;
  rowNumber: number;
  data: Record<string, unknown>;
  error?: string;
  status: 'PENDING' | 'SUCCESS' | 'ERROR';
}
