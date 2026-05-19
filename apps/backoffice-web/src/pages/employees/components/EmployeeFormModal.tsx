import { useMemo, useState, type ReactNode } from "react";
import { AppModal, Button, cn } from "@erp/ui";
import { CircleHelp, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { EmployeeFormDraft } from "../employee.types";
import { validateEmployeeDraft } from "../employee.validation";
import { EmployeeBasicInfoTab } from "./EmployeeBasicInfoTab";
import { EmployeeRolesFormTab } from "./EmployeeRolesFormTab";
import { EmployeeContactFormTab } from "./EmployeeContactFormTab";
import { EmployeeProfileFormTab } from "./EmployeeProfileFormTab";
import { EmployeeAccessTimeTab } from "./EmployeeAccessTimeTab";

export type EmployeeFormMode = "create" | "edit";

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

interface EmployeeFormModalProps {
  open: boolean;
  mode: EmployeeFormMode;
  draft: EmployeeFormDraft;
  onDraftChange: (draft: EmployeeFormDraft) => void;
  onClose: () => void;
  onSave: (draft: EmployeeFormDraft, options: { keepOpen: boolean }) => void;
}

export function EmployeeFormModal({
  open,
  mode,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: EmployeeFormModalProps) {
  const [activeTab, setActiveTab] = useState<EmployeeFormTabEnum>(
    EmployeeFormTabEnum.BASIC,
  );
  const isEdit = mode === "edit";

  const tabs = useMemo<EmployeeFormTabEnum[]>(
    () => Object.values(EmployeeFormTabEnum),
    [],
  );

  const handleSave = (keepOpen: boolean) => {
    const error = validateEmployeeDraft(draft, isEdit);
    if (error) {
      toast.error(error);
      return;
    }
    onSave(draft, { keepOpen });
    if (keepOpen) {
      setActiveTab(EmployeeFormTabEnum.BASIC);
    }
  };

  const title = isEdit ? "Sửa nhân viên" : "Thêm mới Nhân viên";

  const formTabPanels = useMemo<Record<EmployeeFormTabEnum, ReactNode>>(
    () => ({
      [EmployeeFormTabEnum.BASIC]: (
        <EmployeeBasicInfoTab
          draft={draft}
          onChange={onDraftChange}
          isEdit={isEdit}
        />
      ),
      [EmployeeFormTabEnum.ROLES]: (
        <EmployeeRolesFormTab draft={draft} onChange={onDraftChange} />
      ),
      [EmployeeFormTabEnum.CONTACT]: (
        <EmployeeContactFormTab draft={draft} onChange={onDraftChange} />
      ),
      [EmployeeFormTabEnum.PROFILE]: (
        <EmployeeProfileFormTab draft={draft} onChange={onDraftChange} />
      ),
      [EmployeeFormTabEnum.ACCESS]: (
        <EmployeeAccessTimeTab draft={draft} onChange={onDraftChange} />
      ),
    }),
    [draft, onDraftChange, isEdit],
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
            <Button type="button" onClick={() => handleSave(false)}>
              <Save className="mr-1 h-4 w-4" />
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSave(true)}
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
      <nav
        aria-label="Tab biểu mẫu nhân viên"
        className="flex gap-4 overflow-x-auto border-b px-4 text-sm"
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
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
      <div className="flex-1 overflow-y-auto">{formTabPanels[activeTab]}</div>
    </AppModal>
  );
}
