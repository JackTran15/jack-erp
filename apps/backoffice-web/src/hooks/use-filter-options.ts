import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../lib/erp-api";

/**
 * Generic "select" option used by every report filter dropdown.
 * The sentinel `__all__` value means "no filter" — it must be stripped before
 * forwarding to the API.
 */
export interface SelectOption {
  value: string;
  label: string;
}

export const ALL_VALUE = "__all__";

interface UseOptionsOpts {
  withAll?: boolean;
  allLabel?: string;
  /** Disable the underlying query (e.g. while the user isn't authenticated). */
  enabled?: boolean;
}

interface UseOptionsResult {
  options: SelectOption[];
  isLoading: boolean;
}

interface PaginatedListResponse<T> {
  data: T[];
  total: number;
}

const STALE_TIME_MS = 5 * 60_000;

function prependAll(
  items: SelectOption[],
  withAll: boolean,
  allLabel: string,
): SelectOption[] {
  if (!withAll) return items;
  return [{ value: ALL_VALUE, label: allLabel }, ...items];
}

// ──────────────────────────────────────────────────────────────────
// Branches — Cửa hàng (uses the dedicated /branches endpoint, not generic CRUD)
// ──────────────────────────────────────────────────────────────────

interface BranchRow {
  id: string;
  name: string;
}

export function useBranchOptions(opts: UseOptionsOpts = {}): UseOptionsResult {
  const {
    withAll = true,
    allLabel = "Tất cả cửa hàng",
    enabled = true,
  } = opts;
  const query = useQuery({
    queryKey: ["filter-options", "branches"],
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<PaginatedListResponse<BranchRow>>("/branches", {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      );
      return res.data ?? [];
    },
    staleTime: STALE_TIME_MS,
    enabled,
  });
  const options = useMemo(() => {
    const items = (query.data ?? []).map((b) => ({ value: b.id, label: b.name }));
    return prependAll(items, withAll, allLabel);
  }, [query.data, withAll, allLabel]);
  return { options, isLoading: query.isLoading };
}

// ──────────────────────────────────────────────────────────────────
// Item categories — Nhóm hàng hóa
// ──────────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
}

export function useItemCategoryOptions(
  opts: UseOptionsOpts = {},
): UseOptionsResult {
  const { withAll = true, allLabel = "Tất cả nhóm", enabled = true } = opts;
  const query = useQuery({
    queryKey: ["filter-options", "inventory-item-categories"],
    queryFn: async () => {
      // Generic CRUD endpoint returns { data: Record<string, unknown>[], total }
      const res = await requireErpData(
        await erpApi.GET<PaginatedListResponse<CategoryRow>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: "inventory-item-categories" },
              query: { page: 1, pageSize: 100 },
            },
          },
        ),
      );
      return res.data ?? [];
    },
    staleTime: STALE_TIME_MS,
    enabled,
  });
  const options = useMemo(() => {
    const items = (query.data ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    }));
    return prependAll(items, withAll, allLabel);
  }, [query.data, withAll, allLabel]);
  return { options, isLoading: query.isLoading };
}

// ──────────────────────────────────────────────────────────────────
// Storages — Kho (tied to a branch). Returns all storages visible to actor.
// ──────────────────────────────────────────────────────────────────

interface StorageRow {
  id: string;
  name: string;
}

export function useStorageOptions(
  opts: UseOptionsOpts = {},
): UseOptionsResult {
  const { withAll = true, allLabel = "Tất cả kho", enabled = true } = opts;
  const query = useQuery({
    queryKey: ["filter-options", "inventory-storages"],
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<PaginatedListResponse<StorageRow>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: "inventory-storages" },
              query: { page: 1, pageSize: 100 },
            },
          },
        ),
      );
      return res.data ?? [];
    },
    staleTime: STALE_TIME_MS,
    enabled,
  });
  const options = useMemo(() => {
    const items = (query.data ?? []).map((s) => ({
      value: s.id,
      label: s.name,
    }));
    return prependAll(items, withAll, allLabel);
  }, [query.data, withAll, allLabel]);
  return { options, isLoading: query.isLoading };
}

// ──────────────────────────────────────────────────────────────────
// Item units — Đơn vị tính. Backed by GET /reports/inventory/filter-options/units
// which returns DISTINCT items.unit for the active org. Falls back to a
// minimal static list if the call fails / hasn't been deployed yet so the
// filter dialog never breaks.
// ──────────────────────────────────────────────────────────────────

const STATIC_UNIT_FALLBACK: SelectOption[] = [
  { value: "pcs", label: "pcs" },
  { value: "kg", label: "kg" },
  { value: "Đôi", label: "Đôi" },
];

interface UnitOptionsResponse {
  data: SelectOption[];
}

export function useItemUnitOptions(
  opts: UseOptionsOpts = {},
): UseOptionsResult {
  const { withAll = true, allLabel = "Tất cả ĐVT", enabled = true } = opts;
  const query = useQuery({
    queryKey: ["filter-options", "item-units"],
    queryFn: async () => {
      try {
        const res = await requireErpData(
          await erpApi.GET<UnitOptionsResponse>(
            "/reports/inventory/filter-options/units",
            {},
          ),
        );
        return res.data ?? STATIC_UNIT_FALLBACK;
      } catch {
        // Endpoint may not be available in older API builds — degrade gracefully.
        return STATIC_UNIT_FALLBACK;
      }
    },
    staleTime: STALE_TIME_MS,
    enabled,
  });
  const options = useMemo(() => {
    const items = query.data ?? [];
    return prependAll(items, withAll, allLabel);
  }, [query.data, withAll, allLabel]);
  return { options, isLoading: query.isLoading };
}
