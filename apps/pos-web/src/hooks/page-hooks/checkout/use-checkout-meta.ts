import { useMemo } from "react";

import { buildLocalSearch } from "@erp/pos/lib/page-libs/checkout/buildLocalSearch";
import {
  usePriceBooks,
  type PriceBook,
} from "@erp/pos/hooks/page-hooks/checkout/use-price-books";
import {
  useProductGroups,
  type ProductGroup,
} from "@erp/pos/hooks/page-hooks/checkout/use-product-groups";
import {
  useSalespersons,
  type Salesperson,
} from "@erp/pos/hooks/page-hooks/checkout/use-salespersons";
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
 * `productGroups` (static hook).
 */
export const useCheckoutMeta = (): CheckoutMeta => {
  const { salespersons } = useSalespersons();
  const { priceBooks } = usePriceBooks();
  const { productGroups } = useProductGroups();

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
