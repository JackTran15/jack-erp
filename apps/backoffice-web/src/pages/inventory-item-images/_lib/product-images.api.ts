import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../lib/erp-api";

/**
 * Bộ lọc "Tìm kiếm theo" — mirror `ProductImageStatusFilter` của API:
 * MISSING = chưa có ảnh ATTACHED, PRESENT = có ít nhất một ảnh, ALL = không lọc.
 */
export type ProductImageStatus = "ALL" | "MISSING" | "PRESENT";

/** Body của `POST /v2/inventory-items/images/search`. */
export interface ProductImageSearchBody {
  page: number;
  limit: number;
  imageStatus: ProductImageStatus;
  /** Nhóm hàng hoá (kèm nhóm con); null = Tất cả. */
  categoryId: string | null;
  keyword: string;
}

/** Một dòng nhóm hàng hoá: `product` = mẫu mã (products.id), `orphan` = hàng lẻ (items.id). */
export interface ProductImageRow {
  type: "product" | "orphan";
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  imageCount: number;
  thumbnailUrl: string | null;
}

export interface ProductImageSearchResponse {
  data: ProductImageRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Hand-typed until `pnpm openapi:generate` picks the endpoint up (T-02-04);
 * the shapes mirror `product-image-search.dto.ts` on the API.
 */
export async function searchProductImages(
  body: ProductImageSearchBody,
): Promise<ProductImageSearchResponse> {
  return requireErpData(
    await erpApi.POST<ProductImageSearchResponse>(
      "/v2/inventory-items/images/search",
      { body },
    ),
  );
}

/** Kết quả trang Cập nhật ảnh; `body` là bộ lọc đã bấm "Lấy dữ liệu" + trang hiện tại. */
export function useProductImages(body: ProductImageSearchBody, enabled = true) {
  return useQuery({
    queryKey: ["product-images", body],
    queryFn: () => searchProductImages(body),
    enabled,
    placeholderData: (prev) => prev,
  });
}
