import { UseQueryResult, useQuery } from "@tanstack/react-query";
import type {
  PaginatedResponse,
  UserDetail,
  UserSummary,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";

export interface UserListFilters {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}

export function useUsers(filters: UserListFilters) {
  return useQuery({
    queryKey: ["iam", "users", filters],
    queryFn: async () => {
      const query: Record<string, string | number> = {
        page: filters.page,
        pageSize: filters.pageSize,
      };
      if (filters.search?.trim()) {
        query.search = filters.search.trim();
      }
      if (typeof filters.isActive === "boolean") {
        query.isActive = String(filters.isActive);
      }
      return requireErpData(
        await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
          params: { query },
        }),
      );
    },
    placeholderData: (prev) => prev,
  });
}

/** Fetch all active users (for role assignment picker). */
export function useAllUsers(enabled = true) {
  return useQuery({
    queryKey: ["iam", "users", "all"],
    queryFn: async () => {
      const first = await requireErpData(
        await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
          params: { query: { page: 1, pageSize: 200, isActive: "true" } },
        }),
      );
      if (first.total <= first.data.length) {
        return first.data;
      }
      const pages = Math.ceil(first.total / 200);
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, async (_, i) =>
          requireErpData(
            await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
              params: {
                query: { page: i + 2, pageSize: 200, isActive: "true" },
              },
            }),
          ),
        ),
      );
      return [...first.data, ...rest.flatMap((p) => p.data)];
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useUser(
  userId: string | undefined,
): UseQueryResult<UserDetail, Error> {
  return useQuery({
    queryKey: ["iam", "user", userId] as const,
    queryFn: async (): Promise<UserDetail> =>
      requireErpData(
        await erpApi.GET<UserDetail>("/admin/users/{id}", {
          params: { path: { id: userId! } },
        }),
      ),
    enabled: Boolean(userId),
  });
}

/** All users with roleIds (for role assignment tab). */
export function useAllUserDetails(enabled = true) {
  return useQuery({
    queryKey: ["iam", "users", "all-details"],
    queryFn: async () => {
      const summaries = await requireErpData(
        await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
          params: { query: { page: 1, pageSize: 200 } },
        }),
      );
      let all = [...summaries.data];
      const pages = Math.ceil(summaries.total / 200);
      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, async (_, i) =>
            requireErpData(
              await erpApi.GET<PaginatedResponse<UserSummary>>("/admin/users", {
                params: { query: { page: i + 2, pageSize: 200 } },
              }),
            ),
          ),
        );
        all = [...all, ...rest.flatMap((p) => p.data)];
      }

      const concurrency = 8;
      const details: UserDetail[] = [];
      for (let i = 0; i < all.length; i += concurrency) {
        const batch = all.slice(i, i + concurrency);
        const batchDetails = await Promise.all(
          batch.map(async (s) =>
            requireErpData(
              await erpApi.GET<UserDetail>("/admin/users/{id}", {
                params: { path: { id: s.id } },
              }),
            ),
          ),
        );
        details.push(...batchDetails);
      }
      return details;
    },
    enabled,
    staleTime: 30_000,
  });
}
