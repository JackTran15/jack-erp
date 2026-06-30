import { useEffect, useState } from "react";
import { AppModal, FormField, Input, Textarea } from "@erp/ui";
import { toast } from "sonner";
import { useCreateItemUnit } from "../hooks";
import { getUserFacingApiErrorMessage } from "../../../../../lib/user-facing-api-error";
import {
  DIALOG_FORM_FIELD_PROPS,
  DIALOG_FORM_STACK_CLASS,
} from "../../../../forms/dialog-form-layout";

export interface UnitPick {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (unit: UnitPick) => void;
}

/** "Thêm mới đơn vị tính" — name + description quick-create dialog (ref image #7). */
export function UnitCreateDialog({ open, onOpenChange, initialName, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createUnit = useCreateItemUnit();

  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setDescription("");
    }
  }, [open, initialName]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning("Vui lòng nhập đơn vị tính.");
      return;
    }
    try {
      const created = (await createUnit.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
      })) as Record<string, unknown>;
      onCreated({
        id: String(created.id ?? ""),
        name: String(created.name ?? trimmed),
      });
      onOpenChange(false);
      toast.success("Đã tạo đơn vị tính.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Thêm mới đơn vị tính"
      defaultWidth={620}
      defaultHeight={360}
      minWidth={560}
      bodyStretch={false}
      saveLabel={createUnit.isPending ? "Đang lưu…" : "Lưu"}
      saveDisabled={createUnit.isPending || !name.trim()}
      onSave={save}
    >
      <div className={DIALOG_FORM_STACK_CLASS}>
        <FormField
          label="Đơn vị tính"
          htmlFor="unit-create-name"
          required
          {...DIALOG_FORM_FIELD_PROPS}
        >
          <Input
            id="unit-create-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Cái, Hộp, Thùng…"
          />
        </FormField>
        <FormField
          label="Diễn giải"
          htmlFor="unit-create-desc"
          {...DIALOG_FORM_FIELD_PROPS}
        >
          <Textarea
            id="unit-create-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </div>
    </AppModal>
  );
}
