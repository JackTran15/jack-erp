import type { PosProductKind } from "@erp/pos/types/catalog.type";

/** Tham số gọi `GET /pos/branches/:branchId/catalog/products/:id`. */
export interface GetCatalogProductDetailParams {
  branchId: string;
  id: string;
  /** Gợi ý từ list row để bỏ bước resolve product/item. Bỏ trống = auto-resolve. */
  kind?: PosProductKind;
}
