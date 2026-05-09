import { useEffect } from "react";
import { toast } from "sonner";
import { getUserFacingApiErrorMessage } from "../lib/user-facing-api-error";

const TOAST_POSITION = "bottom-right" as const;
const DURATION_ERROR_MS = 6000;
const DURATION_DEFAULT_MS = 4000;

export type QueryToastInput =
  | null
  | undefined
  | { variant: "error"; error: unknown }
  | { variant: "success"; message: string }
  | { variant: "warning"; message: string }
  | { variant: "info"; message: string };

export interface UseQueryToastOptions {
  toastId: string;
  updatedAt?: number;
}

/**
 * Toast assigned with query state to update when refetch.
 */
export function useQueryToast(input: QueryToastInput, options: UseQueryToastOptions): void {
  const { toastId, updatedAt } = options;
  const variant = input?.variant ?? null;
  const errorValue = input?.variant === "error" ? input.error : undefined;
  const textMessage =
    input?.variant === "success" ||
    input?.variant === "warning" ||
    input?.variant === "info"
      ? input.message
      : undefined;

  useEffect(() => {
    if (variant == null) {
      toast.dismiss(toastId);
      return;
    }

    const base = {
      id: toastId,
      position: TOAST_POSITION,
      duration: variant === "error" ? DURATION_ERROR_MS : DURATION_DEFAULT_MS,
    };

    if (variant === "error") {
      toast.error(getUserFacingApiErrorMessage(errorValue), base);
      return;
    }
    if (variant === "success") {
      toast.success(textMessage ?? "", base);
      return;
    }
    if (variant === "warning") {
      toast.warning(textMessage ?? "", base);
      return;
    }
    if (variant === "info") {
      toast.info(textMessage ?? "", base);
    }
  }, [toastId, updatedAt, variant, errorValue, textMessage]);
}
