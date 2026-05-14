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
  GOODS_ISSUE = 'GOODS_ISSUE',
}

export enum TransferStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  RECEIVING = 'RECEIVING',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum GoodsIssueStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export type { Product } from './product';

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
  TEMPORARY = 'TEMPORARY',
}

export enum TemporaryTransferStatus {
  OPEN = 'OPEN',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
  FULLY_RETURNED = 'FULLY_RETURNED',
  CANCELLED = 'CANCELLED',
}

export interface TemporaryTransfer {
  id: string;
  organizationId: string;
  branchId: string;
  documentNumber?: string;
  sourceBranchId: string;
  destinationTempLocationId: string;
  carrierUserId: string;
  status: TemporaryTransferStatus;
  notes?: string;
  postedAt: string;
  postedBy: string;
  returnedAt?: string;
  lines: TemporaryTransferLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface TemporaryTransferLine {
  id: string;
  transferId: string;
  itemId: string;
  sourceLocationId: string;
  quantity: number;
  returnedQuantity: number;
  notes?: string;
}

export interface Provider {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
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
  purchasePrice: number;
  sellingPrice: number;
  providerId: string;
  /** Present on admin list rows when joined from the linked provider. */
  providerName?: string;
  providerCode?: string;
  /** FK to products — null for legacy items without a parent product. */
  productId?: string;
  /** Denormalized display label for variant attributes (e.g. "39 · Nâu"). */
  variantLabel?: string;
  /** Present on list rows when joined from the linked product. */
  productName?: string;
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
  /** Present on admin list rows when joined from the linked item. */
  itemName?: string;
  itemCode?: string;
  /** Category, unit, and description summary from the linked item. */
  itemVariants?: string;
  /** Name of the parent product (via item.product). Empty for legacy items. */
  productName?: string;
  /** Variant attribute label (e.g. "39 · Nâu"), falls back to category/unit/desc for legacy items. */
  variantLabel?: string;
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

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  itemId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  organizationId: string;
  branchId?: string;
  documentNumber?: string;
  providerId: string;
  locationId: string;
  status: PurchaseOrderStatus;
  expectedDate?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  lines: PurchaseOrderLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface GoodsIssueLine {
  id: string;
  goodsIssueId: string;
  itemId: string;
  quantity: number;
  notes?: string;
}

export interface GoodsIssue {
  id: string;
  organizationId: string;
  branchId?: string;
  documentNumber?: string;
  locationId: string;
  reason: string;
  status: GoodsIssueStatus;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  lines: GoodsIssueLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
