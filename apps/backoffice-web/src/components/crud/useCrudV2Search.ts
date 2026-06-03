import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { CRUD_V2_SEARCH, type V2SearchResponse } from "./crudV2Search";

/**
 * Server-side CQRS search for the registered admin entityKeys
 * (`POST /v2/<entity>/search`). Returns the `{ data, total, page, limit }`
 * envelope. `enabled` should gate on the entity actually being in the registry.
 */
export function useCrudV2Search(
  entityKey: string,
  body: Record<string, unknown> | null,
  enabled: boolean,
) {
  const cfg = CRUD_V2_SEARCH[entityKey];
  return useQuery({
    queryKey: ["crud-v2", entityKey, body],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<V2SearchResponse>(cfg!.path, { body: body ?? {} }),
      ),
    enabled: enabled && Boolean(cfg) && Boolean(body),
    placeholderData: (prev) => prev,
  });
}
