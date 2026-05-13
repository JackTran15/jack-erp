import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SearchSuggestion } from "../components/common/SearchPopover";
import type { CatalogProduct } from "../components/types";
import { fetchPosCatalog, type PosCatalogLine } from "@erp/pos/lib/posCatalogApi";
import { locationQtyFor, matchesCatalogQuery } from "../lib/checkoutUtils";

interface ToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

interface UseCheckoutCatalogResult {
  catalog: PosCatalogLine[];
  catalogLoading: boolean;
  catalogError: string;
  loadCatalog: () => Promise<void>;
  toolbar: ToolbarState;
  setToolbar: Dispatch<SetStateAction<ToolbarState>>;
  catalogQuery: string;
  setCatalogQuery: Dispatch<SetStateAction<string>>;
  catalogGroup: string | undefined;
  setCatalogGroup: Dispatch<SetStateAction<string | undefined>>;
  catalogCollapsed: boolean;
  setCatalogCollapsed: Dispatch<SetStateAction<boolean>>;
  filteredProducts: PosCatalogLine[];
  catalogProducts: CatalogProduct[];
  productSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<PosCatalogLine>[]>;
}

export function useCheckoutCatalog(
  branchId: string,
): UseCheckoutCatalogResult {
  const [catalog, setCatalog] = useState<PosCatalogLine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [toolbar, setToolbar] = useState<ToolbarState>({
    query: "",
    qty: 1,
    splitLine: false,
  });
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogGroup, setCatalogGroup] = useState<string | undefined>(
    undefined,
  );
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);

  const loadCatalog = useCallback(async () => {
    setCatalogError("");
    setCatalogLoading(true);
    try {
      const rows = await fetchPosCatalog(branchId);
      setCatalog(rows);
    } catch (e) {
      setCatalog([]);
      setCatalogError(
        e instanceof Error
          ? `Không tải được tồn kho: ${e.message}`
          : "Không tải được tồn kho.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

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
        disabled: locationQtyFor(p) < 1,
      }));
    },
    [catalog],
  );

  return {
    catalog,
    catalogLoading,
    catalogError,
    loadCatalog,
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
