import { useCallback, useMemo } from "react";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import type { CatalogProduct } from "@erp/pos/interfaces/checkout.interface";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { useCatalogQuery } from "@erp/pos/hooks/react-query/use-query-catalog";
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
  catalog: PosCatalogLine[];
  catalogLoading: boolean;
  catalogError: string;
  refetchCatalog: () => void;
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
 * Zero-input adapter. Dữ liệu catalog đến từ React Query (`useCatalogQuery`,
 * tự fetch theo `branchId` lấy từ branch store, dedupe across callsites);
 * toolbar / filter / collapse đọc từ catalog store. Phần derived giữ nguyên.
 */
export function useCheckoutCatalog(): UseCheckoutCatalogResult {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const catalogQueryResult = useCatalogQuery(branchId);
  const catalog = useMemo(
    () => catalogQueryResult.data ?? [],
    [catalogQueryResult.data],
  );
  const catalogLoading = catalogQueryResult.isLoading;
  const catalogError = catalogQueryResult.error
    ? `Không tải được tồn kho: ${catalogQueryResult.error.message}`
    : "";
  const refetchCatalog = useCallback(() => {
    void catalogQueryResult.refetch();
  }, [catalogQueryResult]);

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
    refetchCatalog,
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
