import {
  useCrudCreate,
  useCrudDelete,
  useCrudRecords,
} from "../../useCrudApi";

/** Thin TanStack-Query wrappers over the generic CRUD endpoints used by the
 *  item form pickers and quick-create dialogs. Server data only — never Zustand. */

const pickerParams = (
  search: string,
  sortBy: string,
): {
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  search: string;
  filters: Record<string, unknown>;
} => ({
  page: 1,
  pageSize: 100,
  sortBy,
  sortOrder: "asc",
  search,
  filters: {},
});

// ─── Thương hiệu (Brand) ───────────────────────────────────────────────
export function useBrands(search: string, enabled: boolean) {
  return useCrudRecords("inventory-brands", pickerParams(search, "name"), enabled);
}
export function useCreateBrand() {
  return useCrudCreate("inventory-brands");
}
export function useDeleteBrand() {
  return useCrudDelete("inventory-brands");
}

// ─── Nhóm hàng hóa (Item category) ─────────────────────────────────────
export function useItemCategories(search: string, enabled: boolean) {
  return useCrudRecords(
    "inventory-item-categories",
    pickerParams(search, "name"),
    enabled,
  );
}
export function useCreateItemCategory() {
  return useCrudCreate("inventory-item-categories");
}

// ─── Đơn vị tính (Unit of measure) ─────────────────────────────────────
export function useItemUnits(search: string, enabled: boolean) {
  return useCrudRecords("inventory-item-units", pickerParams(search, "name"), enabled);
}
export function useCreateItemUnit() {
  return useCrudCreate("inventory-item-units");
}

// ─── Nhà cung cấp (Provider) ───────────────────────────────────────────
export function useProviders(search: string, enabled: boolean) {
  return useCrudRecords(
    "inventory-providers",
    {
      page: 1,
      pageSize: 100,
      sortBy: undefined,
      sortOrder: "desc",
      search,
      filters: {},
    },
    enabled,
  );
}
export function useCreateProvider() {
  return useCrudCreate("inventory-providers");
}
