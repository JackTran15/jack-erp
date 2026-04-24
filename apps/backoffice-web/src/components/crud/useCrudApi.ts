import { useState, useEffect, useCallback } from "react";
import { http } from "../../lib/http";
import type {
  CrudEntityConfig,
  PaginatedResponse,
} from "@erp/shared-interfaces";

export function useCrudApi(entityKey: string) {
  const [config, setConfig] = useState<CrudEntityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    http
      .get<CrudEntityConfig>(`/admin/entities/${entityKey}`)
      .then(setConfig)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entityKey]);

  const fetchRecords = useCallback(
    async (params: {
      page: number;
      pageSize: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      search?: string;
      filters?: Record<string, unknown>;
    }) => {
      const qs = new URLSearchParams();
      qs.set("page", String(params.page));
      qs.set("pageSize", String(params.pageSize));
      if (params.sortBy) qs.set("sortBy", params.sortBy);
      if (params.sortOrder) qs.set("sortOrder", params.sortOrder);
      if (params.search) qs.set("search", params.search);
      if (params.filters && Object.keys(params.filters).length) {
        qs.set("filters", JSON.stringify(params.filters));
      }
      return http.get<PaginatedResponse<Record<string, unknown>>>(
        `/admin/entities/${entityKey}/records?${qs}`,
      );
    },
    [entityKey],
  );

  const createRecord = useCallback(
    (body: Record<string, unknown>) =>
      http.post<Record<string, unknown>>(
        `/admin/entities/${entityKey}/records`,
        body,
      ),
    [entityKey],
  );

  const updateRecord = useCallback(
    (id: string, body: Record<string, unknown>) =>
      http.patch<Record<string, unknown>>(
        `/admin/entities/${entityKey}/records/${id}`,
        body,
      ),
    [entityKey],
  );

  const deleteRecord = useCallback(
    (id: string) =>
      http.delete<void>(`/admin/entities/${entityKey}/records/${id}`),
    [entityKey],
  );

  return {
    config,
    loading,
    error,
    fetchRecords,
    createRecord,
    updateRecord,
    deleteRecord,
  };
}
