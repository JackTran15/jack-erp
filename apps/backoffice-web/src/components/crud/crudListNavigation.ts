import type { NavigateFunction } from "react-router-dom";
import type { ColumnFilter } from "../table/pagination.dto";

export interface CrudListReturnState {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  search: string;
  searchInput: string;
  columnFilters: Record<string, ColumnFilter>;
}

export interface CrudListLocationState {
  crudListReturn?: CrudListReturnState;
}

export function toCrudListLocationState(
  listReturn: CrudListReturnState,
): CrudListLocationState {
  return { crudListReturn: listReturn };
}

export function parseCrudListLocationState(
  state: unknown,
): CrudListLocationState | null {
  if (!state || typeof state !== "object") return null;
  const raw = state as Record<string, unknown>;
  const crudListReturn = raw.crudListReturn;
  if (!crudListReturn || typeof crudListReturn !== "object") return null;
  const r = crudListReturn as Record<string, unknown>;
  if (typeof r.page !== "number" || typeof r.pageSize !== "number") return null;
  return {
    crudListReturn: {
      page: r.page,
      pageSize: r.pageSize,
      sortBy: typeof r.sortBy === "string" ? r.sortBy : undefined,
      sortOrder: r.sortOrder === "asc" ? "asc" : "desc",
      search: typeof r.search === "string" ? r.search : "",
      searchInput: typeof r.searchInput === "string" ? r.searchInput : "",
      columnFilters:
        r.columnFilters && typeof r.columnFilters === "object"
          ? (r.columnFilters as Record<string, ColumnFilter>)
          : {},
    },
  };
}

export function navigateToCrudEdit(
  navigate: NavigateFunction,
  entityKey: string,
  id: string,
  listReturn: CrudListReturnState,
) {
  navigate(`/admin/${entityKey}/${id}/edit`, {
    state: toCrudListLocationState(listReturn),
  });
}

export function navigateToCrudList(
  navigate: NavigateFunction,
  entityKey: string,
  listReturn: CrudListReturnState,
) {
  navigate(`/admin/${entityKey}`, {
    replace: true,
    state: toCrudListLocationState(listReturn),
  });
}
