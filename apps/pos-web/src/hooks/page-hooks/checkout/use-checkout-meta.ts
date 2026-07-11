import { useCallback, useMemo } from "react";

import { buildLocalSearch } from "@erp/pos/lib/page-libs/checkout/buildLocalSearch";
import { flattenItemCategoryTree } from "@erp/pos/lib/page-libs/checkout/flattenItemCategoryTree";
import { mapSalesmanToSalesperson } from "@erp/pos/lib/page-libs/checkout/mapSalesman";
import { useSalesmenQuery } from "@erp/pos/hooks/react-query/use-query-sales-hierarchy";
import { useItemCategoryTreeQuery } from "@erp/pos/hooks/react-query/use-query-item-category";
import { PRICE_BOOK_OPTIONS } from "@erp/pos/constants/checkout.constant";
import type {
  PriceBook,
  ProductGroup,
  Salesperson,
} from "@erp/pos/interfaces/checkout.interface";
import {
  selectCatalogDraft,
  selectMetaDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface CheckoutMeta {
  salespersons: ReadonlyArray<Salesperson>;
  priceBooks: ReadonlyArray<PriceBook>;
  productGroups: ReadonlyArray<ProductGroup>;

  selectedSalesperson: Salesperson | null;
  setSelectedSalesperson: (next: Salesperson | null) => void;

  selectedPriceBook: PriceBook | null;
  setSelectedPriceBook: (next: PriceBook | null) => void;

  selectedProductGroup: ProductGroup | null;

  salespersonSearch: ReturnType<typeof buildLocalSearch<Salesperson>>;
  priceBookSearch: ReturnType<typeof buildLocalSearch<PriceBook>>;
  productGroupSearch: ReturnType<typeof buildLocalSearch<ProductGroup>>;
}

/**
 * Zero-input adapter: `selectedSalesperson/PriceBook` từ ui store,
 * `selectedProductGroup` derive từ `catalogGroup` (catalog store) +
 * `productGroups` (option tĩnh từ constants).
 */
export const useCheckoutMeta = (): CheckoutMeta => {
  const { salesmen } = useSalesmenQuery();
  const salespersons = useMemo(
    () => salesmen.map(mapSalesmanToSalesperson),
    [salesmen],
  );
  const priceBooks = PRICE_BOOK_OPTIONS;
  const { data: categoryTree } = useItemCategoryTreeQuery();
  // Option "Tất cả" (id rỗng = không lọc) đứng đầu, sau đó là cây nhóm hàng hóa
  // đã phẳng hoá (giữ `depth` để thụt lề node con).
  const productGroups = useMemo<ProductGroup[]>(
    () => [
      { id: "", name: "Tất cả", depth: 0 },
      ...flattenItemCategoryTree(categoryTree?.data ?? []),
    ],
    [categoryTree],
  );

  const { selectedSalesperson, selectedPriceBook } = usePosCheckoutSessionStore(
    selectMetaDraft,
  );
  const updateDraftSlice = usePosCheckoutSessionStore(
    (s) => s.updateActiveDraftSlice,
  );

  const setSelectedSalesperson = useCallback(
    (next: Salesperson | null) =>
      updateDraftSlice("meta", (m) => ({ ...m, selectedSalesperson: next })),
    [updateDraftSlice],
  );
  const setSelectedPriceBook = useCallback(
    (next: PriceBook | null) =>
      updateDraftSlice("meta", (m) => ({ ...m, selectedPriceBook: next })),
    [updateDraftSlice],
  );

  const catalogGroupId = usePosCheckoutSessionStore(
    (s) => selectCatalogDraft(s).catalogGroup,
  );

  const selectedProductGroup = useMemo<ProductGroup | null>(
    () => productGroups.find((g) => g.id === catalogGroupId) ?? null,
    [productGroups, catalogGroupId],
  );

  const salespersonSearch = useMemo(
    () => buildLocalSearch(salespersons, (s) => s.name),
    [salespersons],
  );
  const priceBookSearch = useMemo(
    () => buildLocalSearch(priceBooks, (p) => p.name),
    [priceBooks],
  );
  const productGroupSearch = useMemo(
    () => buildLocalSearch(productGroups, (g) => g.name),
    [productGroups],
  );

  return {
    salespersons,
    priceBooks,
    productGroups,
    selectedSalesperson,
    setSelectedSalesperson,
    selectedPriceBook,
    setSelectedPriceBook,
    selectedProductGroup,
    salespersonSearch,
    priceBookSearch,
    productGroupSearch,
  };
};
