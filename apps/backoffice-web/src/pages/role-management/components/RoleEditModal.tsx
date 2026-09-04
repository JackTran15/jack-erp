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
  /** Forces view-only mode. Defaults to "system role being edited". */
  readOnly?: boolean;
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
  readOnly: readOnlyProp,
  saving = false,
  onDraftChange,
  onClose,
  onSave,
}: RoleEditModalProps) {
  const readOnly = readOnlyProp ?? (isSystem && mode === "edit");
  const title = readOnly
    ? isSystem
      ? "Xem vai trò hệ thống"
      : "Xem vai trò"
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
      defaultWidth={1280}
      defaultHeight={780}
      // The permission editor scrolls its own two panes; without this the body
      // scrolls instead and takes "Thông tin cơ bản" off screen with it.
      bodyClassName="overflow-hidden"
      showFooter={true}
      footer={
        <div className="flex w-full justify-end gap-2">
          {!readOnly && (
            <Button
              type="button"
              className="!bg-primary-blue !text-primary-blue-foreground hover:!bg-primary-blue-hover"
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
      {/*
        Fixed head, scrolling tail: the role's name and description stay put
        while the permission matrix scrolls, so you can always see which role
        you are editing. Everything above the matrix is `shrink-0`; the matrix
        takes the rest with `flex-1 min-h-0`.
      */}
      <div className="flex h-full min-h-0 flex-col gap-6">
        {isSystem && (
          <Badge variant="secondary" className="shrink-0">
            Vai trò hệ thống — không chỉnh sửa hoặc xóa
          </Badge>
        )}
        <section className="shrink-0 space-y-3">
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

        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <h3 className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground">
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
