import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CrudEntityConfig,
  PaginatedResponse,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";

interface FetchRecordsParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
  filters?: Record<string, unknown>;
}

function buildRecordsQuery(
  params: FetchRecordsParams,
): Record<string, string | number | undefined> {
  const q: Record<string, string | number | undefined> = {
    page: params.page,
    pageSize: params.pageSize,
  };
  if (params.sortBy) q.sortBy = params.sortBy;
  if (params.sortOrder) q.sortOrder = params.sortOrder;
  if (params.search) q.search = params.search;
  if (params.filters && Object.keys(params.filters).length) {
    q.filters = JSON.stringify(params.filters);
  }
  return q;
}

export function useCrudConfig(entityKey: string) {
  return useQuery({
    queryKey: ["crud", entityKey, "config"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CrudEntityConfig>("/admin/entities/{entityKey}", {
          params: { path: { entityKey } },
        }),
      ),
  });
}

export function useCrudRecords(
  entityKey: string,
  params: FetchRecordsParams,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["crud", entityKey, "records", params],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
          "/admin/entities/{entityKey}/records",
          {
            params: { path: { entityKey }, query: buildRecordsQuery(params) },
          },
        ),
      ),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useCrudCreate(entityKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      requireErpData(
        await erpApi.POST<Record<string, unknown>>(
          "/admin/entities/{entityKey}/records",
          { params: { path: { entityKey } }, body },
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crud", entityKey, "records"] });
    },
  });
}

export function useCrudUpdate(entityKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) =>
      requireErpData(
        await erpApi.PATCH<Record<string, unknown>>(
          "/admin/entities/{entityKey}/records/{id}",
          { params: { path: { entityKey, id } }, body },
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crud", entityKey, "records"] });
    },
  });
}

export function useCrudDelete(entityKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/admin/entities/{entityKey}/records/{id}", {
          params: { path: { entityKey, id } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crud", entityKey, "records"] });
    },
  });
}
