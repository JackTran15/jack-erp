import { AppModal, Button, FormField, Input } from "@erp/ui";
import { X } from "lucide-react";
import type { RoleFormDraft } from "../role-management.types";
import { RolePermissionsEditor } from "./RolePermissionsEditor";

interface RoleEditModalProps {
  open: boolean;
  draft: RoleFormDraft;
  onDraftChange: (draft: RoleFormDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

export function RoleEditModal({
  open,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: RoleEditModalProps) {
  const handleSave = () => {
    if (!draft.name.trim()) return;
    onSave();
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Sửa quản lý vai trò"
      defaultWidth={960}
      defaultHeight={700}
      showFooter={true}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" onClick={handleSave} disabled={!draft.name.trim()}>
            Lưu
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 overflow-y-auto p-4">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
            THÔNG TIN CƠ BẢN
          </h3>
          <FormField label="Tên vai trò" required>
            <Input
              value={draft.name}
              onChange={(e) =>
                onDraftChange({ ...draft, name: e.target.value })
              }
            />
          </FormField>
          <FormField label="Diễn giải">
            <Input
              value={draft.description}
              onChange={(e) =>
                onDraftChange({ ...draft, description: e.target.value })
              }
            />
          </FormField>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
            PHÂN QUYỀN
          </h3>
          <RolePermissionsEditor
            permissionIds={draft.permissionIds}
            onChange={(permissionIds) =>
              onDraftChange({ ...draft, permissionIds })
            }
          />
        </section>
      </div>
    </AppModal>
  );
}
