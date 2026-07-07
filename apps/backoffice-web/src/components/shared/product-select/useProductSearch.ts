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
  /** Only "đang theo dõi" items. Omit to include ngừng-theo-dõi items too. */
  isActive?: boolean;
}

interface ProductItemsParams {
  productId: string;
  page: number;
  pageSize: number;
  isActive?: boolean;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

export async function fetchProductGroups(
  params: ProductGroupsParams,
): Promise<PaginatedResult<ProductGroupRow>> {
  return requireErpData(
    await erpApi.GET<PaginatedResult<ProductGroupRow>>(
      "/inventory/items/products",
      {
        params: {
          query: {
            page: params.page,
            pageSize: params.pageSize,
            search: params.search || undefined,
            categoryId: params.categoryId || undefined,
            isActive: params.isActive,
          },
        },
      },
    ),
  );
}

export async function fetchProductVariants(
  params: ProductItemsParams,
): Promise<PaginatedResult<ProductVariantRow>> {
  return requireErpData(
    await erpApi.GET<PaginatedResult<ProductVariantRow>>(
      "/inventory/items/products/{productId}/items",
      {
        params: {
          path: { productId: params.productId },
          query: {
            page: params.page,
            pageSize: params.pageSize,
            isActive: params.isActive,
          },
        },
      },
    ),
  );
}

export function productGroupsQueryKey(params: ProductGroupsParams) {
  return ["inventory-product-groups", params] as const;
}

export function productVariantsQueryKey(params: ProductItemsParams) {
  return [
    "inventory-product-items",
    params.productId,
    params.page,
    params.pageSize,
    params.isActive ?? null,
  ] as const;
}

export function useProductGroups(params: ProductGroupsParams) {
  return useQuery({
    queryKey: productGroupsQueryKey(params),
    queryFn: () => fetchProductGroups(params),
    placeholderData: (prev) => prev,
  });
}

export function useProductVariants(params: ProductItemsParams, enabled: boolean) {
  return useQuery({
    queryKey: productVariantsQueryKey(params),
    queryFn: () => fetchProductVariants(params),
    enabled,
    placeholderData: (prev) => prev,
  });
}
