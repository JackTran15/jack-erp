import { useCallback, useMemo } from "react";
import type { CatalogProduct } from "@erp/pos/interfaces/checkout.interface";
import {
  useCatalogProductsQuery,
} from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import {
  selectCatalogDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

type Updater<T> = T | ((prev: T) => T);

const apply = <T>(prev: T, value: Updater<T>): T =>
  typeof value === "function" ? (value as (p: T) => T)(prev) : value;

interface ToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

interface UseCheckoutCatalogResult {
  /** Loading riêng cho grid product-level (drive trạng thái Đang tải/Trống của grid). */
  catalogProductsLoading: boolean;
  catalogProductsError: string;
  refetchCatalogProducts: () => void;
  toolbar: ToolbarState;
  setToolbar: (value: Updater<ToolbarState>) => void;
  catalogQuery: string;
  setCatalogQuery: (value: Updater<string>) => void;
  catalogGroup: string | undefined;
  setCatalogGroup: (value: Updater<string | undefined>) => void;
  catalogCollapsed: boolean;
  setCatalogCollapsed: (value: Updater<boolean>) => void;
  catalogProducts: CatalogProduct[];
}

/**
 * Zero-input adapter cho LƯỚI sản phẩm mức product (`useCatalogProductsQuery`,
 * tự fetch theo `branchId` lấy từ branch store, dedupe across callsites);
 * toolbar / filter / collapse đọc từ catalog store.
 *
 * KHÔNG còn tải catalog phẳng toàn chi nhánh. Trước đây hook này gọi
 * `useCatalogQuery` — 10 400 item ≈ 3 835 kB mỗi lần mở trang trên bản restore
 * prod — để phục vụ đúng hai câu hỏi, và cả hai giờ hỏi thẳng server:
 * tồn của các dòng trong giỏ (`POST /catalog/stock`) và "chuỗi này khớp mấy mặt
 * hàng" (`GET /catalog/search`).
 */
export function useCheckoutCatalog(): UseCheckoutCatalogResult {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  // catalogGroup giữ id danh mục đã chọn ("" = "Tất cả" = không lọc).
  const catalogGroupId = usePosCheckoutSessionStore(
    (s) => selectCatalogDraft(s).catalogGroup,
  );
  const categoryId = catalogGroupId ? catalogGroupId : undefined;
  const productsQueryResult = useCatalogProductsQuery(branchId, categoryId);
  const productCards = useMemo(
    () => productsQueryResult.data?.data ?? [],
    [productsQueryResult.data],
  );
  const catalogProductsLoading = productsQueryResult.isLoading;
  // Nguồn lỗi/tải lại chuyển sang query của LƯỚI: sau khi bỏ tải toàn catalog, đó
  // là thứ duy nhất còn tải được và hỏng được ở màn này. Đổi luôn tên để nó nói
  // đúng nguồn, thay vì giữ tên cũ trỏ chỗ khác.
  const catalogProductsError = productsQueryResult.error
    ? `Không tải được danh sách hàng hoá: ${productsQueryResult.error.message}`
    : "";
  const refetchCatalogProducts = useCallback(() => {
    void productsQueryResult.refetch();
  }, [productsQueryResult]);

  const { toolbar, catalogQuery, catalogGroup, catalogCollapsed } =
    usePosCheckoutSessionStore(selectCatalogDraft);
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  const setToolbar = useCallback(
    (value: Updater<ToolbarState>) =>
      updateDraftSlice("catalog", (c) => ({
        ...c,
        toolbar: apply(c.toolbar, value),
      })),
    [updateDraftSlice],
  );
  const setCatalogQuery = useCallback(
    (value: Updater<string>) =>
      updateDraftSlice("catalog", (c) => ({
        ...c,
        catalogQuery: apply(c.catalogQuery, value),
      })),
    [updateDraftSlice],
  );
  const setCatalogGroup = useCallback(
    (value: Updater<string | undefined>) =>
      updateDraftSlice("catalog", (c) => ({
        ...c,
        catalogGroup: apply(c.catalogGroup, value),
      })),
    [updateDraftSlice],
  );
  const setCatalogCollapsed = useCallback(
    (value: Updater<boolean>) =>
      updateDraftSlice("catalog", (c) => ({
        ...c,
        catalogCollapsed: apply(c.catalogCollapsed, value),
      })),
    [updateDraftSlice],
  );

  // Grid hiển thị MỖI SẢN PHẨM 1 card (product-level). Lọc client-side theo tên
  // trên danh sách product đã tải (endpoint products không có tham số search).
  const catalogProducts: CatalogProduct[] = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    return productCards
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({
        id: c.id,
        name: c.name,
        price: c.minPrice ?? 0,
        kind: c.kind,
      }));
  }, [productCards, catalogQuery]);

  return {
    catalogProductsLoading,
    catalogProductsError,
    refetchCatalogProducts,
    toolbar,
    setToolbar,
    catalogQuery,
    setCatalogQuery,
    catalogGroup,
    setCatalogGroup,
    catalogCollapsed,
    setCatalogCollapsed,
    catalogProducts,
  };
}
