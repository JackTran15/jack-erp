import { useCallback, useMemo } from "react";

import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  usePreloadTempWarehouseCarriers,
  useSearchTempWarehouseCarriers,
} from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";

type Updater<T> = T | ((prev: T) => T);

interface CarrierToolbarState {
  query: string;
}

interface UseFastStockTransferCarriersResult {
  carriersLoading: boolean;
  carrierToolbar: CarrierToolbarState;
  setCarrierToolbar: (value: Updater<CarrierToolbarState>) => void;
  carrierSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<TempWarehousePublicUser>[]>;
  resolveCarrierById: (userId: string) => TempWarehousePublicUser | null;
}

export function useFastStockTransferCarriers(): UseFastStockTransferCarriersResult {
  const branchId = usePosBranchStore((s) => s.branchId);
  const searchCarriers = useSearchTempWarehouseCarriers();

  const { isLoading: carriersLoading } =
    usePreloadTempWarehouseCarriers(branchId);
  const carrierToolbar = usePosFastStockTransferPickerStore(
    (s) => s.carrierToolbar,
  );
  const setCarrierToolbar = usePosFastStockTransferPickerStore(
    (s) => s.setCarrierToolbar,
  );
  const listCarriers = usePosFastStockTransferPickerStore(
    (s) => s.listCarriers,
  );
  const upsertCarriers = usePosFastStockTransferPickerStore(
    (s) => s.upsertCarriers,
  );
  const getCarrierById = usePosFastStockTransferPickerStore(
    (s) => s.getCarrierById,
  );

  const filterCarriers = useCallback(
    (merged: TempWarehousePublicUser[], query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return merged;
      return merged.filter((c) => {
        const label = formatCarrierName(c).toLowerCase();
        return label.includes(q) || c.email.toLowerCase().includes(q);
      });
    },
    [],
  );

  const carrierSearchAdapter = useCallback(
    async (
      query: string,
    ): Promise<SearchSuggestion<TempWarehousePublicUser>[]> => {
      const trimmed = query.trim();
      let rows = listCarriers();

      if (trimmed && branchId) {
        const result = await searchCarriers(branchId, trimmed);
        upsertCarriers(result.data);
        rows = listCarriers();
      }

      return filterCarriers(rows, trimmed).map((item) => ({ item }));
    },
    [branchId, filterCarriers, listCarriers, searchCarriers, upsertCarriers],
  );

  const resolveCarrierById = useCallback(
    (userId: string) => getCarrierById(userId),
    [getCarrierById],
  );

  return useMemo(
    () => ({
      carriersLoading,
      carrierToolbar,
      setCarrierToolbar,
      carrierSearchAdapter,
      resolveCarrierById,
    }),
    [
      carriersLoading,
      carrierToolbar,
      setCarrierToolbar,
      carrierSearchAdapter,
      resolveCarrierById,
    ],
  );
}
