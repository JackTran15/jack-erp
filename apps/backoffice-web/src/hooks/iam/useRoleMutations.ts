import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RoleDetail } from "@erp/shared-interfaces";
import {
  draftToCreateRoleRequest,
  draftToSetPermissionsRequest,
  draftToUpdateRoleRequest,
  type RoleFormDraft,
} from "../../lib/iam";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RoleFormDraft) =>
      requireErpData(
        await erpApi.POST<RoleDetail>("/admin/roles", {
          body: draftToCreateRoleRequest(draft),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "roles"] });
    },
  });
}

export function useUpdateRole(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      isSystem,
    }: {
      draft: RoleFormDraft;
      isSystem: boolean;
    }) =>
      requireErpData(
        await erpApi.PATCH<RoleDetail>("/admin/roles/{id}", {
          params: { path: { id: roleId } },
          body: draftToUpdateRoleRequest(draft, isSystem),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "roles"] });
      void qc.invalidateQueries({ queryKey: ["iam", "role", roleId] });
    },
  });
}

export function useSetRolePermissions(roleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RoleFormDraft) =>
      requireErpData(
        await erpApi.PUT<RoleDetail>("/admin/roles/{id}/permissions", {
          params: { path: { id: roleId } },
          body: draftToSetPermissionsRequest(draft),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "roles"] });
      void qc.invalidateQueries({ queryKey: ["iam", "role", roleId] });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roleId: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/admin/roles/{id}", {
          params: { path: { id: roleId } },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "roles"] });
    },
  });
}
