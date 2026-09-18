import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { CRUD_TREE_ENTITIES, type CrudTreeResponse } from "./crudTree";

/**
 * Loads a tree-mode entity (`CRUD_TREE_ENTITIES`) as a nested parent → child
 * structure from its `POST …/tree` endpoint. The key is
 * `[config.queryKey, body]`, which is what `useCrudApi` mutations invalidate.
 */
export function useCrudTree(
  entityKey: string,
  body: Record<string, unknown>,
  enabled: boolean,
) {
  const config = CRUD_TREE_ENTITIES[entityKey];
  return useQuery({
    queryKey: [config?.queryKey ?? "crud-tree", body],
    queryFn: async () => {
      if (!config) throw new Error(`No tree config for ${entityKey}`);
      return requireErpData(
        await erpApi.POST<CrudTreeResponse>(config.path, { body }),
      );
    },
    enabled: enabled && Boolean(config),
    placeholderData: (prev) => prev,
  });
}
