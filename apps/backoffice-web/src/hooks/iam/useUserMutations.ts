import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserDetail } from "@erp/shared-interfaces";
import {
  draftToCreateUserRequest,
  type UserUpdatePayload,
} from "../../lib/iam";
import { erpApi, requireErpData, requireErpSuccess } from "../../lib/erp-api";
import type { EmployeeFormDraft } from "../../pages/employees/employee.types";

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: EmployeeFormDraft) =>
      requireErpData(
        await erpApi.POST<UserDetail>("/admin/users", {
          body: draftToCreateUserRequest(draft),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
    },
  });
}

export function useUpdateUser(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UserUpdatePayload) => {
      // Remaining fields (firstName/lastName/isActive + nested HR `profile`) go in the PATCH body.
      const { roleIds, branchIds, newTemporaryPassword, ...userPatch } = payload;

      let detail: UserDetail | undefined;
      if (Object.keys(userPatch).length > 0) {
        detail = await requireErpData(
          await erpApi.PATCH<UserDetail>("/admin/users/{id}", {
            params: { path: { id: userId } },
            body: userPatch,
          }),
        );
      }

      if (roleIds) {
        await requireErpData(
          await erpApi.POST<{ roleIds: string[] }>("/admin/users/{id}/roles", {
            params: { path: { id: userId } },
            body: { roleIds },
          }),
        );
      }

      if (branchIds) {
        await requireErpData(
          await erpApi.POST<{ branchIds: string[] }>(
            "/admin/users/{id}/branches",
            {
              params: { path: { id: userId } },
              body: { branchIds },
            },
          ),
        );
      }

      if (newTemporaryPassword) {
        await requireErpSuccess(
          await erpApi.POST("/admin/users/{id}/reset-password", {
            params: { path: { id: userId } },
            body: { newTemporaryPassword },
          }),
        );
      }

      if (!detail) {
        detail = await requireErpData(
          await erpApi.GET<UserDetail>("/admin/users/{id}", {
            params: { path: { id: userId } },
          }),
        );
      }
      return detail;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", userId] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/admin/users/{id}", {
          params: { path: { id: userId } },
        }),
      ),
    onSuccess: (_, userId) => {
      void qc.invalidateQueries({ queryKey: ["iam", "users"] });
      void qc.invalidateQueries({ queryKey: ["iam", "user", userId] });
    },
  });
}

export function useResetUserPassword(userId: string) {
  return useMutation({
    mutationFn: async (newTemporaryPassword: string) =>
      requireErpSuccess(
        await erpApi.POST("/admin/users/{id}/reset-password", {
          params: { path: { id: userId } },
          body: { newTemporaryPassword },
        }),
      ),
  });
}
