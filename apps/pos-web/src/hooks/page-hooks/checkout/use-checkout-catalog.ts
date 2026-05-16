import { useCallback, useMemo } from "react";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import type { CatalogProduct } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import type { PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";

type Updater<T> = T | ((prev: T) => T);

interface ToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

interface UseCheckoutCatalogResult {
  catalog: PosCatalogLine[];
  catalogLoading: boolean;
  catalogError: string;
  toolbar: ToolbarState;
  setToolbar: (value: Updater<ToolbarState>) => void;
  catalogQuery: string;
  setCatalogQuery: (value: Updater<string>) => void;
  catalogGroup: string | undefined;
  setCatalogGroup: (value: Updater<string | undefined>) => void;
  catalogCollapsed: boolean;
  setCatalogCollapsed: (value: Updater<boolean>) => void;
  filteredProducts: PosCatalogLine[];
  catalogProducts: CatalogProduct[];
  productSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<PosCatalogLine>[]>;
}

/**
 * Zero-input adapter. Trigger fetch nằm ở `useCheckoutCatalogLoader(branchId)`
 * (Page gọi); adapter này chỉ đọc state + tính derived.
 */
export function useCheckoutCatalog(): UseCheckoutCatalogResult {
  const catalog = usePosCheckoutCatalogStore((s) => s.catalog);
  const catalogLoading = usePosCheckoutCatalogStore((s) => s.catalogLoading);
  const catalogError = usePosCheckoutCatalogStore((s) => s.catalogError);
  const toolbar = usePosCheckoutCatalogStore((s) => s.toolbar);
  const setToolbar = usePosCheckoutCatalogStore((s) => s.setToolbar);
  const catalogQuery = usePosCheckoutCatalogStore((s) => s.catalogQuery);
  const setCatalogQuery = usePosCheckoutCatalogStore(
    (s) => s.setCatalogQuery,
  );
  const catalogGroup = usePosCheckoutCatalogStore((s) => s.catalogGroup);
  const setCatalogGroup = usePosCheckoutCatalogStore(
    (s) => s.setCatalogGroup,
  );
  const catalogCollapsed = usePosCheckoutCatalogStore(
    (s) => s.catalogCollapsed,
  );
  const setCatalogCollapsed = usePosCheckoutCatalogStore(
    (s) => s.setCatalogCollapsed,
  );

  const filteredProducts = useMemo(() => {
    return catalog.filter((p) => matchesCatalogQuery(p, toolbar.query));
  }, [catalog, toolbar.query]);

  const catalogProducts: CatalogProduct[] = useMemo(() => {
    const filtered = catalog.filter((p) => matchesCatalogQuery(p, catalogQuery));
    return filtered.map((p) => ({
      id: p.itemId,
      name: p.name,
      price: p.sellingPrice ?? 0,
    }));
  }, [catalog, catalogQuery]);

  const productSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogLine>[]> => {
      const matched = catalog.filter((p) => matchesCatalogQuery(p, q));
      return matched.slice(0, 8).map((p) => ({
        item: p,
      }));
    },
    [catalog],
  );

  return {
    catalog,
    catalogLoading,
    catalogError,
    toolbar,
    setToolbar,
    catalogQuery,
    setCatalogQuery,
    catalogGroup,
    setCatalogGroup,
    catalogCollapsed,
    setCatalogCollapsed,
    filteredProducts,
    catalogProducts,
    productSearchAdapter,
  };
}
