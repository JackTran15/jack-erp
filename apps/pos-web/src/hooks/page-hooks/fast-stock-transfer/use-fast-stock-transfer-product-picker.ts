import { useCallback, useMemo } from "react";

import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  POS_CATALOG_QUERY_LIMIT,
  useSearchPosBranchCatalog,
} from "@erp/pos/hooks/react-query/use-query-catalog";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";

const PRODUCT_SEARCH_MIN_CHARS = 1;

type Updater<T> = T | ((prev: T) => T);

interface ProductToolbarState {
  query: string;
}

interface UseFastStockTransferProductPickerResult {
  catalogDirection: PosCatalogDirection;
  productToolbar: ProductToolbarState;
  setProductToolbar: (value: Updater<ProductToolbarState>) => void;
  productSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<PosCatalogLine>[]>;
  findProduct: (itemId: string) => PosCatalogLine | null;
}

export function useFastStockTransferProductPicker(): UseFastStockTransferProductPickerResult {
  const branchId = usePosBranchStore((s) => s.branchId);
  const searchCatalog = useSearchPosBranchCatalog();

  const catalogDirection = usePosFastStockTransferPickerStore(
    (s) => s.catalogDirection,
  );
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

  const productSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogLine>[]> => {
      const normalized = q.trim();
      if (normalized.length < PRODUCT_SEARCH_MIN_CHARS || !branchId) {
        return [];
      }

      const rows = await searchCatalog(branchId, catalogDirection, normalized);
      upsertProducts(rows);

      return rows
        .filter((p) => matchesCatalogQuery(p, normalized))
        .slice(0, POS_CATALOG_QUERY_LIMIT)
        .map((item) => ({ item }));
    },
    [branchId, catalogDirection, searchCatalog, upsertProducts],
  );

  return useMemo(
    () => ({
      catalogDirection,
      productToolbar,
      setProductToolbar,
      productSearchAdapter,
      findProduct,
    }),
    [
      catalogDirection,
      productToolbar,
      setProductToolbar,
      productSearchAdapter,
      findProduct,
    ],
  );
}
