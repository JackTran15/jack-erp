import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { matchesCatalogQuery } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { catalogService } from "@erp/pos/services/catalog.service";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CATALOG_LIMIT = 40;
const SEARCH_DEBOUNCE_MS = 280;

export function useFastStockTransferCatalog(
  branchId: string | null,
  catalogDirection: PosCatalogDirection,
) {
  const [catalogLines, setCatalogLines] = useState<PosCatalogLine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const loadCatalog = useCallback(
    async (search?: string) => {
      if (!branchId) {
        setCatalogLines([]);
        return;
      }
      const reqId = ++requestIdRef.current;
      setCatalogLoading(true);
      try {
        const rows = await catalogService.fetch(branchId, search, catalogDirection);
        if (reqId !== requestIdRef.current) return;
        setCatalogLines(rows.slice(0, CATALOG_LIMIT));
      } catch {
        if (reqId !== requestIdRef.current) return;
        setCatalogLines([]);
      } finally {
        if (reqId === requestIdRef.current) setCatalogLoading(false);
      }
    },
    [branchId, catalogDirection],
  );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleCatalogQueryChange = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void loadCatalog(query.trim() || undefined);
      }, SEARCH_DEBOUNCE_MS);
    },
    [loadCatalog],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const searchCatalogProducts = useCallback(
    (
      query: string,
    ): ReadonlyArray<PosSelectSearchSuggestion<PosCatalogLine>> => {
      const normalized = query.trim();
      const source =
        normalized.length > 0
          ? catalogLines.filter((p) => matchesCatalogQuery(p, normalized))
          : catalogLines;
      return source.slice(0, CATALOG_LIMIT).map((item) => ({ item }));
    },
    [catalogLines],
  );

  const findCatalogProduct = useCallback(
    (itemId: string): PosCatalogLine | null =>
      catalogLines.find((p) => p.itemId === itemId) ?? null,
    [catalogLines],
  );

  return useMemo(
    () => ({
      catalogLines,
      catalogLoading,
      catalogDirection,
      searchCatalogProducts,
      handleCatalogQueryChange,
      findCatalogProduct,
      reloadCatalog: () => loadCatalog(),
    }),
    [
      catalogLines,
      catalogLoading,
      catalogDirection,
      searchCatalogProducts,
      handleCatalogQueryChange,
      findCatalogProduct,
      loadCatalog,
    ],
  );
}
