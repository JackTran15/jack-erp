import { useMemo } from "react";

import { buildLocalSearch } from "@erp/pos/lib/page-libs/checkout/buildLocalSearch";
import {
  CATALOG_GROUP_OPTIONS,
  PRICE_BOOK_OPTIONS,
  SALESPERSON_OPTIONS,
} from "@erp/pos/constants/checkout.constant";
import type {
  PriceBook,
  ProductGroup,
  Salesperson,
} from "@erp/pos/interfaces/checkout.interface";
import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

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
  const salespersons = SALESPERSON_OPTIONS;
  const priceBooks = PRICE_BOOK_OPTIONS;
  const productGroups = CATALOG_GROUP_OPTIONS;

  const selectedSalesperson = usePosCheckoutUiStore(
    (s) => s.selectedSalesperson,
  );
  const setSelectedSalesperson = usePosCheckoutUiStore(
    (s) => s.setSelectedSalesperson,
  );
  const selectedPriceBook = usePosCheckoutUiStore((s) => s.selectedPriceBook);
  const setSelectedPriceBook = usePosCheckoutUiStore(
    (s) => s.setSelectedPriceBook,
  );

  const catalogGroupId = usePosCheckoutCatalogStore((s) => s.catalogGroup);

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
