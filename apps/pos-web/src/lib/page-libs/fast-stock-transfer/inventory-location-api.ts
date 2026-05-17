import { http } from "@erp/pos/lib/common/http";
import type {
  PaginatedResponse,
  PaginationQuery,
} from "@erp/shared-interfaces";

export interface InventoryStorageOption {
  id: string;
  name: string;
  branchId: string;
  isMainStorage: boolean;
}

export interface InventoryShowroomOption {
  id: string;
  name: string;
  branchId: string;
  storageId: string;
  isMainShowroom: boolean;
}

const DEFAULT_LIST_PAGINATION: PaginationQuery = {
  page: 1,
  pageSize: 100,
};

function buildListQuery(
  branchId: string,
  pagination: PaginationQuery = DEFAULT_LIST_PAGINATION,
): string {
  const q = new URLSearchParams({
    branchId,
    page: String(pagination.page),
    pageSize: String(pagination.pageSize),
  });
  if (pagination.sortBy) q.set("sortBy", pagination.sortBy);
  if (pagination.sortOrder) q.set("sortOrder", pagination.sortOrder);
  return q.toString();
}

export async function listBranchStorages(
  branchId: string,
): Promise<ReadonlyArray<InventoryStorageOption>> {
  const result = await http.get<PaginatedResponse<InventoryStorageOption>>(
    `/inventory/storages?${buildListQuery(branchId)}`,
  );
  return result.data;
}

export async function listBranchShowrooms(
  branchId: string,
): Promise<ReadonlyArray<InventoryShowroomOption>> {
  const result = await http.get<PaginatedResponse<InventoryShowroomOption>>(
    `/inventory/showrooms?${buildListQuery(branchId)}`,
  );
  return result.data;
}
