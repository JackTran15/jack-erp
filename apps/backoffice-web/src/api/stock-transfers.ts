import { apiClient } from "../lib/api-axios";

export interface IntraWarehouseTransferLine {
  itemId: string;
  quantity: number;
  notes?: string;
  /** Per-line source location. Falls back to header `sourceLocationId` when omitted. */
  sourceLocationId?: string;
  /** Per-line destination location. Falls back to header `destinationLocationId` when omitted. */
  destinationLocationId?: string;
}

export interface CreateIntraWarehouseTransferPayload {
  /** Header-level source. Optional when every line carries its own `sourceLocationId`. */
  sourceLocationId?: string;
  /** Header-level destination. Optional when every line carries its own `destinationLocationId`. */
  destinationLocationId?: string;
  lines: IntraWarehouseTransferLine[];
}

export interface StockTransferResult {
  id: string;
  status: string;
  documentNumber?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  postedAt?: string;
}

export async function createIntraWarehouseTransfer(
  payload: CreateIntraWarehouseTransferPayload,
): Promise<StockTransferResult> {
  const { data } = await apiClient.post<StockTransferResult>(
    "/inventory/stock/transfers/intra-warehouse",
    payload,
  );
  return data;
}
