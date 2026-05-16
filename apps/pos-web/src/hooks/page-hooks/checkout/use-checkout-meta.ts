import { useMemo, useState } from "react";

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

export const useCheckoutMeta = (
  catalogGroupId: string | undefined,
): CheckoutMeta => {
  const { salespersons } = useSalespersons();
  const { priceBooks } = usePriceBooks();
  const { productGroups } = useProductGroups();

  const [selectedSalesperson, setSelectedSalesperson] =
    useState<Salesperson | null>(null);
  const [selectedPriceBook, setSelectedPriceBook] = useState<PriceBook | null>(
    null,
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
