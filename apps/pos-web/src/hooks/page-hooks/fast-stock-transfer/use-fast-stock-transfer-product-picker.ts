import { useCallback, useMemo, useRef } from "react";

import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  POS_CATALOG_QUERY_LIMIT,
  useLookupCatalogByCode,
  useSearchCatalog,
} from "@erp/pos/hooks/react-query/use-query-catalog";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";

const PRODUCT_QUERY_MIN_CHARS = 1;

type Updater<T> = T | ((prev: T) => T);

interface ProductToolbarState {
  query: string;
}

interface UseFastStockTransferProductPickerResult {
  productToolbar: ProductToolbarState;
  setProductToolbar: (value: Updater<ProductToolbarState>) => void;
  /** Lookup exact code trước; không khớp thì fallback `catalog?search` ILIKE. */
  productHybridAdapter: (
    q: string,
    onAutoSelect?: (product: PosCatalogLine) => void,
  ) => Promise<SearchSuggestion<PosCatalogLine>[]>;
  resetLookupGuard: () => void;
  findProduct: (itemId: string) => PosCatalogLine | null;
}

export function useFastStockTransferProductPicker(): UseFastStockTransferProductPickerResult {
  const branchId = usePosBranchStore((s) => s.branchId);
  const lookup = useLookupCatalogByCode();
  const searchCatalog = useSearchCatalog();
  const claimRef = useRef<string | null>(null);

  const productToolbar = usePosFastStockTransferPickerStore(
    (s) => s.productToolbar,
  );
  const setProductToolbar = usePosFastStockTransferPickerStore(
    (s) => s.setProductToolbar,
  );
  const upsertProducts = usePosFastStockTransferPickerStore(
    (s) => s.upsertProducts,
  );
  const findProduct = usePosFastStockTransferPickerStore((s) => s.findProduct);

  const resetLookupGuard = useCallback(() => {
    claimRef.current = null;
  }, []);

  const productSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogLine>[]> => {
      const normalized = q.trim();
      if (normalized.length < PRODUCT_QUERY_MIN_CHARS || !branchId) {
        return [];
      }

      const rows = await searchCatalog(branchId, normalized);
      upsertProducts(rows);

      return rows
        .filter((p) => matchesCatalogQuery(p, normalized))
        .slice(0, POS_CATALOG_QUERY_LIMIT)
        .map((item) => ({ item }));
    },
    [branchId, searchCatalog, upsertProducts],
  );

  const productHybridAdapter = useCallback(
    async (
      q: string,
      onAutoSelect?: (product: PosCatalogLine) => void,
    ): Promise<SearchSuggestion<PosCatalogLine>[]> => {
      const code = q.trim();
      if (code.length < PRODUCT_QUERY_MIN_CHARS || !branchId) {
        return [];
      }

      let lookupRows: PosCatalogLine[];
      try {
        lookupRows = await lookup(branchId, code);
      } catch {
        lookupRows = [];
      }

      if (lookupRows.length > 0) {
        upsertProducts(lookupRows);

        if (lookupRows.length === 1 && onAutoSelect) {
          if (claimRef.current === code) return [];
          claimRef.current = code;
          onAutoSelect(lookupRows[0]!);
          return [];
        }

        claimRef.current = null;
        return lookupRows.map((item) => ({ item }));
      }

      claimRef.current = null;
      return productSearchAdapter(q);
    },
    [branchId, lookup, productSearchAdapter, upsertProducts],
  );

  return useMemo(
    () => ({
      productToolbar,
      setProductToolbar,
      productHybridAdapter,
      resetLookupGuard,
      findProduct,
    }),
    [
      productToolbar,
      setProductToolbar,
      productHybridAdapter,
      resetLookupGuard,
      findProduct,
    ],
  );
}
