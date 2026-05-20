import { useMutation, useQueryClient } from "@tanstack/react-query";
import { computeRoleAssignmentUpdates } from "../../lib/iam";
import { erpApi, requireErpData } from "../../lib/erp-api";

export function useSetUserRoles(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleIds: string[]) =>
      requireErpData(
        await erpApi.POST<{ roleIds: string[] }>("/admin/users/{id}/roles", {
          params: { path: { id: userId } },
          body: { roleIds },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", userId] });
    },
  });
}

export function useSetUserBranches(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchIds: string[]) =>
      requireErpData(
        await erpApi.POST<{ branchIds: string[] }>(
          "/admin/users/{id}/branches",
          {
            params: { path: { id: userId } },
            body: { branchIds },
          },
        ),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", userId] });
    },
  });
}

export async function syncRoleUserAssignments(
  updates: Array<{ userId: string; roleIds: string[] }>,
): Promise<number> {
  let count = 0;
  for (const { userId, roleIds } of updates) {
    await requireErpData(
      await erpApi.POST<{ roleIds: string[] }>("/admin/users/{id}/roles", {
        params: { path: { id: userId } },
        body: { roleIds },
      }),
    );
    count += 1;
  }
  return count;
}

export function useSyncRoleUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      allUsers,
      roleId,
      desiredUserIds,
    }: {
      allUsers: Array<{ id: string; roleIds: string[] }>;
      roleId: string;
      desiredUserIds: string[];
    }) => {
      const updates = computeRoleAssignmentUpdates(
        allUsers,
        roleId,
        desiredUserIds,
      );
      const count = await syncRoleUserAssignments(updates);
      return count;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "users", "all-details"] });
    },
  });
}
