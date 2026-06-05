import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: { id: string; name: string }[];
}

export function useCurrentUser(): UseQueryResult<CurrentUser> {
  return useQuery({
    queryKey: ["user", "me"] as const,
    queryFn: async () =>
      requireErpData(await erpApi.GET<CurrentUser>("/admin/users/me")),
    staleTime: 10 * 60_000,
  });
}
