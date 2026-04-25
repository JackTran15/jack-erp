import type { PaginationQuery } from "@erp/shared-interfaces";

export interface PaginationStateDto extends PaginationQuery {
  search?: string;
}

export const DEFAULT_PAGINATION: PaginationStateDto = {
  page: 1,
  pageSize: 20,
  sortBy: "createdAt",
  sortOrder: "desc",
  search: "",
};
