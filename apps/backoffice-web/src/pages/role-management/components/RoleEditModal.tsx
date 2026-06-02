import { AppModal, Badge, Button, FormField, Input } from "@erp/ui";
import { X } from "lucide-react";
import type { RoleFormDraft } from "../../../lib/iam";
import { RolePermissionsEditor } from "./RolePermissionsEditor";

export type RoleEditMode = "create" | "edit";

interface RoleEditModalProps {
  open: boolean;
  mode: RoleEditMode;
  draft: RoleFormDraft;
  isSystem?: boolean;
  saving?: boolean;
  onDraftChange: (draft: RoleFormDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

export function RoleEditModal({
  open,
  mode,
  draft,
  isSystem = false,
  saving = false,
  onDraftChange,
  onClose,
  onSave,
}: RoleEditModalProps) {
  const readOnly = isSystem && mode === "edit";
  const title = readOnly
    ? "Xem vai trò hệ thống"
    : mode === "create"
      ? "Thêm vai trò mới"
      : "Sửa quản lý vai trò";

  const handleSave = () => {
    if (readOnly || !draft.name.trim()) return;
    onSave();
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={title}
      defaultWidth={960}
      defaultHeight={700}
      showFooter={true}
      footer={
        <div className="flex w-full justify-end gap-2">
          {!readOnly && (
            <Button
              type="button"
              onClick={handleSave}
              disabled={!draft.name.trim() || saving}
            >
              Lưu
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            {readOnly ? "Đóng" : "Hủy bỏ"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 flex-1">
        {isSystem && (
          <Badge variant="secondary">
            Vai trò hệ thống — không chỉnh sửa hoặc xóa
          </Badge>
        )}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">
            THÔNG TIN CƠ BẢN
          </h3>
          <FormField label="Tên vai trò" required>
            <Input
              value={draft.name}
              disabled={readOnly}
              onChange={(e) =>
                onDraftChange({ ...draft, name: e.target.value })
              }
            />
          </FormField>
          <FormField label="Diễn giải">
            <Input
              value={draft.description}
              disabled={readOnly}
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
            permissionKeys={draft.permissionKeys}
            readOnly={readOnly}
            onChange={(permissionKeys) =>
              onDraftChange({ ...draft, permissionKeys })
            }
          />
        </section>
      </div>
    </AppModal>
  );
}
