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
  /** POS invoice that consumed this line via checkout fulfillment (TRANSFERRED-by-sale); null otherwise. */
  invoiceId?: string | null;
  /** Human-readable code of the consuming invoice (denormalized). */
  invoiceNumber?: string | null;
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
  /** Direction of this session (w2s = warehouse_to_showroom, s2w = showroom_to_warehouse); null for legacy combined sessions. */
  direction: TempWarehouseDirection | null;
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
  /** Required — selects/opens the per-direction session and is the line's direction. */
  direction: TempWarehouseDirection;
  /** Warehouse-side storage for this session; resolved to its default location. Falls back to branch main storage when omitted. Only used when opening the session. */
  warehouseStorageId?: string;
  /** Showroom-side storage for this session; resolved to its default location. Falls back to branch main showroom when omitted. Only used when opening the session. */
  showroomStorageId?: string;
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
  branchId: string;
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

export interface CloseBranchSessionsResult {
  /** The 0..2 sessions that were closed (w2s and/or s2w). */
  sessions: TempWarehouseSession[];
  /** True when both direction sessions existed and shared warehouse + showroom locations (NET_OFFSET allowed). */
  netOffsetEligible: boolean;
  /** Compensating lines created on close — only when mode = NET_OFFSET. */
  autoBalancedLines?: TempWarehouseLine[];
  /** Transfer-requested events published — only when mode = CREATE_TRANSFERS. */
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
