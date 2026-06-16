import { useMutation } from "@tanstack/react-query";
import { authService } from "@erp/pos/services/auth.service";

/**
 * `POST /auth/switch-branch` — re-issues the JWT + refresh token for the chosen
 * branch and persists them to localStorage. Callers update the branch store and
 * hard-reload on success so every cached query refetches under the new token.
 */
export const useSwitchBranchMutation = () =>
  useMutation<void, Error, string>({
    mutationFn: (branchId) => authService.switchBranch(branchId),
  });
