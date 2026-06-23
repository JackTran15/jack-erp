import { useQuery } from "@tanstack/react-query";
import type { RoleDetail, RoleSummary } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";

interface RoleStringFilter {
  operator: "*" | "=" | "+" | "-" | "!";
  value: string;
}

export interface RoleSearchBody {
  page: number;
  limit: number;
  name?: RoleStringFilter;
  description?: RoleStringFilter;
}

interface RoleSearchResponse {
  data: RoleSummary[];
  total: number;
  page: number;
  limit: number;
}

export function useRoles() {
  return useQuery({
    queryKey: ["iam", "roles"],
    queryFn: async (): Promise<RoleSummary[]> =>
      requireErpData(await erpApi.GET<RoleSummary[]>("/admin/roles")),
  });
}

export function useRoleSearch(body: RoleSearchBody) {
  return useQuery({
    queryKey: ["iam", "roles-search", body],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<RoleSearchResponse>("/v2/roles/search", { body }),
      ),
    placeholderData: (prev) => prev,
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
