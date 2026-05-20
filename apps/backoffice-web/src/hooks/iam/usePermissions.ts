import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PermissionsCatalogue } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { buildPermissionModules } from "./permission-module-labels";

export function usePermissions() {
  const query = useQuery({
    queryKey: ["iam", "permissions"],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PermissionsCatalogue>("/admin/permissions"),
      ),
    staleTime: 5 * 60_000,
  });

  const modules = useMemo(
    () => (query.data ? buildPermissionModules(query.data) : []),
    [query.data],
  );

  return { ...query, modules };
}
