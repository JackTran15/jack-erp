import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../lib/erp-api";

interface NamedItem {
  id: string;
  name: string;
  branchId?: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

interface FilterOption {
  value: string;
  label: string;
  branchId?: string;
}

function toIdOptions(items: NamedItem[], allLabel: string): FilterOption[] {
  return [
    { value: "__all__", label: allLabel },
    ...items.map((i) => ({ value: i.id, label: i.name, branchId: i.branchId })),
  ];
}

export function useReportStorages() {
  const q = useQuery({
    queryKey: ["report-filter", "storages"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResult<NamedItem>>("/inventory/storages", {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      ),
    staleTime: 5 * 60_000,
  });
  return {
    options: toIdOptions(q.data?.data ?? [], "Tất cả kho"),
    isLoading: q.isLoading,
  };
}

export function useReportCategories() {
  const q = useQuery({
    queryKey: ["report-filter", "categories"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResult<NamedItem>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: "inventory-item-categories" },
              query: { page: 1, pageSize: 100 },
            },
          },
        ),
      ),
    staleTime: 5 * 60_000,
  });
  return {
    options: toIdOptions(q.data?.data ?? [], "Tất cả nhóm"),
    isLoading: q.isLoading,
  };
}

export function useReportUnits() {
  const q = useQuery({
    queryKey: ["report-filter", "units"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResult<NamedItem>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: "inventory-item-units" },
              query: { page: 1, pageSize: 100 },
            },
          },
        ),
      ),
    staleTime: 5 * 60_000,
  });
  // Units are matched by name string (not id) — unit filter is display-only
  const items = q.data?.data ?? [];
  return {
    options: [
      { value: "__all__", label: "Tất cả ĐVT" },
      ...items.map((u) => ({ value: u.name, label: u.name })),
    ] as FilterOption[],
    isLoading: q.isLoading,
  };
}
