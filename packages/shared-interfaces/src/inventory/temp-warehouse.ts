import type { PaginatedResponse } from '../common';

export enum TempWarehouseSessionStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
}

export enum TempWarehouseLineStatus {
  ACTIVE = "ACTIVE",
  DELETED = "DELETED",
  AUTO_BALANCED = "AUTO_BALANCED",
  TRANSFERRED = "TRANSFERRED",
}

export enum TempWarehouseDirection {
  WAREHOUSE_TO_SHOWROOM = "warehouse_to_showroom",
  SHOWROOM_TO_WAREHOUSE = "showroom_to_warehouse",
}

export enum TempWarehouseCloseMode {
  NET_OFFSET = "NET_OFFSET",
  CREATE_TRANSFERS = "CREATE_TRANSFERS",
  NONE = "NONE",
}

export enum TempWarehouseTransferProcessingStatus {
  NONE = "NONE",
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface TempWarehousePublicUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface TempWarehousePublicItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  variantLabel: string | null;
}

export interface TempWarehousePublicLocation {
  id: string;
  code: string;
  name: string;
}

export interface TempWarehouseLine {
  id: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  itemId: string;
  direction: TempWarehouseDirection;
  quantity: string;
  carrierUserId: string | null;
  status: TempWarehouseLineStatus;
  supersededById: string | null;
  notes: string | null;
  sourceLocationId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  carrier?: TempWarehousePublicUser | null;
  item?: TempWarehousePublicItem | null;
  sourceLocation?: TempWarehousePublicLocation | null;
  destinationLocation?: TempWarehousePublicLocation | null;
}

export interface TempWarehouseSession {
  id: string;
  organizationId: string;
  branchId: string;
  status: TempWarehouseSessionStatus;
  closeMode: TempWarehouseCloseMode | null;
  warehouseLocationId: string;
  showroomLocationId: string;
  openedBy: string;
  openedAt: string;
  closedBy: string | null;
  closedAt: string | null;
  transferProcessingStatus: TempWarehouseTransferProcessingStatus;
  transferW2sId: string | null;
  transferS2wId: string | null;
  transferFailureReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lines?: TempWarehouseLine[];
}

export interface TempWarehouseNettedItem {
  itemId: string;
  item: TempWarehousePublicItem | null;
  totalW2s: number;
  totalS2w: number;
  netQuantity: number;
  netDirection: TempWarehouseDirection | null;
  lineIdsW2s: string[];
  lineIdsS2w: string[];
  carriers: TempWarehousePublicUser[];
}

export interface AddTempWarehouseLineBody {
  branchId: string;
  itemId: string;
  direction?: TempWarehouseDirection;
  carrierUserId?: string;
  notes?: string;
  sourceLocationId?: string;
}

export interface UpdateTempWarehouseLineBody {
  itemId?: string;
  carrierUserId?: string | null;
  notes?: string | null;
  sourceLocationId?: string | null;
}

export interface CloseTempWarehouseSessionBody {
  mode: TempWarehouseCloseMode;
}

export interface AddLineResult {
  session: TempWarehouseSession;
  line: TempWarehouseLine;
}

export interface UpdateLineResult {
  oldLine: TempWarehouseLine;
  newLine: TempWarehouseLine;
}

export interface CloseSessionResult {
  session: TempWarehouseSession;
  autoBalancedLines?: TempWarehouseLine[];
  publishedEvents?: { direction: TempWarehouseDirection; eventId: string }[];
}

export type ListLinesRawResult = PaginatedResponse<TempWarehouseLine> & {
  sessionId: string | null;
};

export interface ListLinesNettedResult {
  sessionId: string | null;
  items: TempWarehouseNettedItem[];
}

export interface TransferTempWarehouseLinesBody {
  lineIds: string[];
  notes?: string;
}

export interface TransferLinesPublishedEvent {
  direction: TempWarehouseDirection;
  eventId: string;
  lineIds: string[];
}

export interface TransferLinesResult {
  session: TempWarehouseSession;
  publishedEvents: TransferLinesPublishedEvent[];
}

export type ListCarriersResult = PaginatedResponse<TempWarehousePublicUser>;
