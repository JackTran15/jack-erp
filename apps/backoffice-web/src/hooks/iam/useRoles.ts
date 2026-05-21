import { useQuery } from "@tanstack/react-query";
import type { RoleDetail, RoleSummary } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";

export function useRoles() {
  return useQuery({
    queryKey: ["iam", "roles"],
    queryFn: async (): Promise<RoleSummary[]> =>
      requireErpData(await erpApi.GET<RoleSummary[]>("/admin/roles")),
  });
}

export function useRole(roleId: string | undefined) {
  return useQuery({
    queryKey: ["iam", "role", roleId],
    queryFn: async (): Promise<RoleDetail> =>
      requireErpData(
        await erpApi.GET<RoleDetail>("/admin/roles/{id}", {
          params: { path: { id: roleId! } },
        }),
      ),
    enabled: Boolean(roleId),
  });
}
