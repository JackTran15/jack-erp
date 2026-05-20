import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { tempWarehouseService } from "@erp/pos/services/temp-warehouse.service";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CARRIERS_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 280;

function mergeCarriers(
  fetched: ReadonlyArray<TempWarehousePublicUser>,
  pinned: ReadonlyArray<TempWarehousePublicUser | null | undefined>,
): TempWarehousePublicUser[] {
  const byId = new Map<string, TempWarehousePublicUser>();
  for (const user of pinned) {
    if (user) byId.set(user.id, user);
  }
  for (const user of fetched) {
    byId.set(user.id, user);
  }
  return [...byId.values()].sort((a, b) =>
    formatCarrierName(a).localeCompare(formatCarrierName(b), "vi"),
  );
}

export function useFastStockTransferCarriers(
  branchId: string | null,
  pinnedCarriers: ReadonlyArray<TempWarehousePublicUser | null | undefined>,
) {
  const [carrierRows, setCarrierRows] = useState<TempWarehousePublicUser[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const loadCarriers = useCallback(
    async (search?: string) => {
      if (!branchId) {
        setCarrierRows([]);
        return;
      }
      const reqId = ++requestIdRef.current;
      setCarriersLoading(true);
      try {
        const result = await tempWarehouseService.listCarriers({
          branchId,
          search,
          pagination: { page: 1, pageSize: CARRIERS_PAGE_SIZE },
        });
        if (reqId !== requestIdRef.current) return;
        setCarrierRows(result.data);
      } catch {
        if (reqId !== requestIdRef.current) return;
        setCarrierRows([]);
      } finally {
        if (reqId === requestIdRef.current) setCarriersLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  const handleCarrierQueryChange = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void loadCarriers(query.trim() || undefined);
      }, SEARCH_DEBOUNCE_MS);
    },
    [loadCarriers],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const carriersForSearch = useMemo(
    () => mergeCarriers(carrierRows, pinnedCarriers),
    [carrierRows, pinnedCarriers],
  );

  const searchFastStockCarriers = useCallback(
    (
      query: string,
    ): ReadonlyArray<PosSelectSearchSuggestion<TempWarehousePublicUser>> => {
      const q = query.trim().toLowerCase();
      const source = q
        ? carriersForSearch.filter((c) => {
            const label = formatCarrierName(c).toLowerCase();
            return label.includes(q) || c.email.toLowerCase().includes(q);
          })
        : carriersForSearch;
      return source.map((item) => ({ item }));
    },
    [carriersForSearch],
  );

  const resolveCarrierById = useCallback(
    (userId: string): TempWarehousePublicUser | null =>
      carriersForSearch.find((c) => c.id === userId) ?? null,
    [carriersForSearch],
  );

  return useMemo(
    () => ({
      carriersLoading,
      searchFastStockCarriers,
      handleCarrierQueryChange,
      resolveCarrierById,
      reloadCarriers: () => loadCarriers(),
    }),
    [
      carriersLoading,
      searchFastStockCarriers,
      handleCarrierQueryChange,
      resolveCarrierById,
      loadCarriers,
    ],
  );
}
