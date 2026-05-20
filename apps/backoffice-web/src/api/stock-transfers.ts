import { apiClient } from "../lib/api-axios";

export interface IntraWarehouseTransferLine {
  itemId: string;
  quantity: number;
  notes?: string;
}

export interface CreateIntraWarehouseTransferPayload {
  sourceLocationId: string;
  destinationLocationId: string;
  lines: IntraWarehouseTransferLine[];
}

export interface StockTransferResult {
  id: string;
  status: string;
  documentNumber?: string;
  sourceLocationId: string;
  destinationLocationId: string;
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
