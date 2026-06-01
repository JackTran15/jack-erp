import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../lib/erp-api";

export interface ProductGroupRow {
  type: "product" | "orphan";
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  brand: string | null;
  itemType: string | null;
  isPosVisible: boolean;
  isActive: boolean;
  itemCount: number;
}

export interface ProductVariantRow {
  id: string;
  code: string;
  name: string;
  variantLabel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  brand: string | null;
  itemType: string | null;
  isPosVisible: boolean;
  isActive: boolean;
}

interface ProductGroupsParams {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export function useInventoryProductGroups(params: ProductGroupsParams) {
  return useQuery({
    queryKey: ["inventory-product-groups", params],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResult<ProductGroupRow>>(
          "/inventory/items/products",
          {
            params: {
              query: {
                page: params.page,
                pageSize: params.pageSize,
                search: params.search || undefined,
                categoryId: params.categoryId || undefined,
              },
            },
          },
        ),
      ),
    placeholderData: (prev) => prev,
  });
}

interface ProductItemsParams {
  productId: string;
  page: number;
  pageSize: number;
}

export function useInventoryProductItems(
  params: ProductItemsParams,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["inventory-product-items", params.productId, params.page, params.pageSize],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResult<ProductVariantRow>>(
          "/inventory/items/products/{productId}/items",
          {
            params: {
              path: { productId: params.productId },
              query: { page: params.page, pageSize: params.pageSize },
            },
          },
        ),
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}
