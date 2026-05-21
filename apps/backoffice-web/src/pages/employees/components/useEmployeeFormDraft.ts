import { useEffect, useRef, useState } from "react";
import type { UserDetail } from "@erp/shared-interfaces";
import { useUser } from "../../../hooks/iam";
import {
  createEmptyDraft,
  userDetailToEmployeeDraft,
} from "../employee.mappers";
import type { EmployeeFormDraft, EmployeeFormMode } from "../employee.types";

interface UseEmployeeFormDraftParams {
  open: boolean;
  mode: EmployeeFormMode;
  userId?: string;
  initialDraft?: EmployeeFormDraft;
}

export function useEmployeeFormDraft({
  open,
  mode,
  userId,
  initialDraft,
}: UseEmployeeFormDraftParams) {
  const isEdit = mode === "edit";
  const {
    data: loadedUser,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useUser(open && isEdit ? userId : undefined);

  const isLoadingDetail =
    isEdit &&
    Boolean(userId) &&
    !isError &&
    !loadedUser &&
    (isLoading || isFetching);

  const [draft, setDraft] = useState<EmployeeFormDraft>(createEmptyDraft);
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      hydratedKeyRef.current = null;
      return;
    }

    if (!isEdit) {
      const key = initialDraft ? "create:seed" : "create:empty";
      if (hydratedKeyRef.current !== key) {
        setDraft(initialDraft ?? createEmptyDraft());
        hydratedKeyRef.current = key;
      }
      return;
    }

    if (
      userId &&
      loadedUser?.id === userId &&
      hydratedKeyRef.current !== userId
    ) {
      setDraft(userDetailToEmployeeDraft(loadedUser));
      hydratedKeyRef.current = userId;
    }
  }, [open, isEdit, userId, loadedUser, initialDraft]);

  return {
    draft,
    setDraft,
    loadedUser: isEdit ? (loadedUser as UserDetail | undefined) : undefined,
    isLoadingDetail,
    isError: isEdit && isError,
    error,
    refetch,
  };
}
