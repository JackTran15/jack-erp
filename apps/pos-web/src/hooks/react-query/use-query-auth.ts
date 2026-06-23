import { useMutation } from "@tanstack/react-query";
import { authService } from "@erp/pos/services/auth.service";

/**
 * `POST /auth/switch-branch` — re-issues the JWT + refresh token for the chosen
 * branch and persists them to localStorage. Callers update the branch store and
 * clear the query cache on success so every query refetches under the new token
 * (the API derives actor.branchId from the JWT, so the token must match).
 */
export const useSwitchBranchMutation = () =>
  useMutation<void, Error, string>({
    mutationFn: (branchId) => authService.switchBranch(branchId),
  });
