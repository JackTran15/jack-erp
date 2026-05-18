import { useMemo } from "react";

export interface ProductGroup {
  id: string;
  name: string;
}

// TODO: replace with API call
const CATALOG_GROUP_OPTIONS: ReadonlyArray<ProductGroup> = [
  { id: "all", name: "Tất cả" },
  { id: "drink", name: "Nước uống" },
  { id: "food", name: "Đồ ăn" },
  { id: "other", name: "Khác" },
];

export interface UseProductGroupsResult {
  productGroups: ReadonlyArray<ProductGroup>;
  isLoading: boolean;
  error: string | null;
}

export const useProductGroups = (): UseProductGroupsResult => {
  return useMemo(
    () => ({
      productGroups: CATALOG_GROUP_OPTIONS,
      isLoading: false,
      error: null,
    }),
    [],
  );
};
