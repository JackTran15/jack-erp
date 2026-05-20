import type { UserDetail } from "@erp/shared-interfaces";
import { DocumentType } from "@erp/shared-interfaces";
import { AppModal, Button, cn } from "@erp/ui";
import { CircleHelp, Loader2, Plus, RefreshCw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useGenerateDocumentNumber } from "../../../hooks/document-numbering";
import { getIamErrorMessage } from "../../../hooks/iam";
import { getUserFacingApiErrorMessage } from "../../../lib/user-facing-api-error";
import type { EmployeeFormDraft, EmployeeFormMode } from "../employee.types";
import { validateEmployeeDraft } from "../employee.validation";
import { EmployeeAccessTimeTab } from "./EmployeeAccessTimeTab";
import { EmployeeBasicInfoTab } from "./EmployeeBasicInfoTab";
import { EmployeeContactFormTab } from "./EmployeeContactFormTab";
import { EmployeeProfileFormTab } from "./EmployeeProfileFormTab";
import { EmployeeRolesFormTab } from "./EmployeeRolesFormTab";
import { useEmployeeFormDraft } from "./useEmployeeFormDraft";

export type { EmployeeFormMode } from "../employee.types";

export enum EmployeeFormTabEnum {
  BASIC = "basic",
  ROLES = "roles",
  CONTACT = "contact",
  PROFILE = "profile",
  ACCESS = "access",
}

export const EMPLOYEE_FORM_TAB_LABELS: Record<EmployeeFormTabEnum, string> = {
  [EmployeeFormTabEnum.BASIC]: "Thông tin cơ bản",
  [EmployeeFormTabEnum.ROLES]: "Vai trò",
  [EmployeeFormTabEnum.CONTACT]: "Thông tin liên hệ",
  [EmployeeFormTabEnum.PROFILE]: "Thông tin hồ sơ",
  [EmployeeFormTabEnum.ACCESS]: "Thời gian truy cập",
};

export interface EmployeeFormSaveContext {
  loadedUser?: UserDetail;
}

interface EmployeeFormModalProps {
  open: boolean;
  mode: EmployeeFormMode;
  userId?: string;
  initialDraft?: EmployeeFormDraft;
  onClose: () => void;
  onSave: (draft: EmployeeFormDraft, context: EmployeeFormSaveContext) => void;
}

function EmployeeFormLoadingOverlay() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/20"
      aria-busy="true"
      aria-live="polite"
      aria-label="Đang tải dữ liệu nhân viên"
    >
      <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-white px-8 py-5 shadow-lg">
        <Loader2
          className="h-9 w-9 animate-spin text-primary"
          strokeWidth={2}
        />
        <span
          className="text-xl font-medium tracking-[0.35em] text-muted-foreground"
          aria-hidden
        >
          ···
        </span>
      </div>
    </div>
  );
}

export function EmployeeFormModal({
  open,
  mode,
  userId,
  initialDraft,
  onClose,
  onSave,
}: EmployeeFormModalProps) {
  const [activeTab, setActiveTab] = useState<EmployeeFormTabEnum>(
    EmployeeFormTabEnum.BASIC,
  );
  const [changePassword, setChangePassword] = useState(false);
  const isEdit = mode === "edit";

  const {
    draft,
    setDraft,
    loadedUser,
    isLoadingDetail,
    isError,
    error,
    refetch,
  } = useEmployeeFormDraft({ open, mode, userId, initialDraft });

  useEffect(() => {
    if (!open || mode !== "edit") {
      setChangePassword(false);
    }
  }, [open, mode]);
  const { mutateAsync: generateDocumentNumber, isPending: isGeneratingCode } =
    useGenerateDocumentNumber();

  useEffect(() => {
    if (!open || mode !== "create") return;

    let cancelled = false;
    void generateDocumentNumber({ documentType: DocumentType.EMPLOYEE })
      .then((code) => {
        if (cancelled) return;
        setDraft((current) => ({
          ...current,
          basic: { ...current.basic, code },
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          getUserFacingApiErrorMessage(err) ||
            "Không sinh được mã. Vui lòng nhập thủ công.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, generateDocumentNumber, setDraft]);

  const tabs = useMemo<EmployeeFormTabEnum[]>(
    () => Object.values(EmployeeFormTabEnum),
    [],
  );

  const formReady = !isEdit || Boolean(loadedUser);

  const handleSave = () => {
    const error = validateEmployeeDraft(draft, isEdit, {
      changePassword: isEdit && changePassword,
    });
    if (error) {
      toast.error(error);
      return;
    }
    onSave(draft, { loadedUser });
  };

  const title = isEdit ? "Sửa nhân viên" : "Thêm mới Nhân viên";

  const formTabPanels = useMemo<Record<EmployeeFormTabEnum, ReactNode>>(
    () => ({
      [EmployeeFormTabEnum.BASIC]: (
        <EmployeeBasicInfoTab
          draft={draft}
          onChange={setDraft}
          isEdit={isEdit}
          isGeneratingCode={isGeneratingCode}
          changePassword={changePassword}
          onChangePassword={setChangePassword}
        />
      ),
      [EmployeeFormTabEnum.ROLES]: (
        <EmployeeRolesFormTab draft={draft} onChange={setDraft} />
      ),
      [EmployeeFormTabEnum.CONTACT]: (
        <EmployeeContactFormTab draft={draft} onChange={setDraft} />
      ),
      [EmployeeFormTabEnum.PROFILE]: (
        <EmployeeProfileFormTab draft={draft} onChange={setDraft} />
      ),
      [EmployeeFormTabEnum.ACCESS]: (
        <EmployeeAccessTimeTab draft={draft} onChange={setDraft} />
      ),
    }),
    [draft, isEdit, isGeneratingCode, changePassword],
  );

  const body = isError ? (
    <div className="space-y-3 p-4 flex flex-col items-center justify-center h-full">
      <p className="text-sm text-destructive">
        {getIamErrorMessage(error, "Không tải được thông tin nhân viên.")}
      </p>
      <Button type="button" variant="outline" onClick={() => void refetch()}>
        <RefreshCw className="mr-1 h-4 w-4" />
        Thử lại
      </Button>
    </div>
  ) : (
    <div
      className={cn(
        "relative flex min-h-[28rem] flex-col",
        isLoadingDetail && "pointer-events-none select-none",
      )}
    >
      <nav
        aria-label="Tab biểu mẫu nhân viên"
        className="flex shrink-0 gap-4 overflow-x-auto border-b text-sm"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            tabIndex={isLoadingDetail ? -1 : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 py-2 font-medium transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {EMPLOYEE_FORM_TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto py-0">
        {formTabPanels[activeTab]}
      </div>
      {isLoadingDetail && <EmployeeFormLoadingOverlay />}
    </div>
  );

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      defaultWidth={960}
      defaultHeight={750}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={() => toast.info("Tài liệu trợ giúp sẽ được bổ sung sau.")}
          >
            <CircleHelp className="h-4 w-4" />
            Trợ giúp
          </button>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={handleSave} disabled={!formReady}>
              <Save className="mr-1 h-4 w-4" />
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={!formReady}
            >
              <Plus className="mr-1 h-4 w-4" />
              Lưu và thêm mới
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-1 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      {body}
    </AppModal>
  );
}
