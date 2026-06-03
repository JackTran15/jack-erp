import { useEffect, useState } from "react";
import { AppModal, FormField, Input } from "@erp/ui";
import { toast } from "sonner";
import { useCreateBrand } from "../hooks";
import { getUserFacingApiErrorMessage } from "../../../../../lib/user-facing-api-error";

export interface BrandPick {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (brand: BrandPick) => void;
}

/** "Thêm mới Thương hiệu" — single-field quick-create dialog (ref image #3). */
export function BrandCreateDialog({ open, onOpenChange, initialName, onCreated }: Props) {
  const [name, setName] = useState("");
  const createBrand = useCreateBrand();

  useEffect(() => {
    if (open) setName(initialName ?? "");
  }, [open, initialName]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning("Vui lòng nhập tên thương hiệu.");
      return;
    }
    try {
      const created = (await createBrand.mutateAsync({ name: trimmed })) as Record<
        string,
        unknown
      >;
      onCreated({
        id: String(created.id ?? ""),
        name: String(created.name ?? trimmed),
      });
      onOpenChange(false);
      toast.success("Đã tạo thương hiệu.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Thêm mới Thương hiệu"
      defaultWidth={520}
      defaultHeight={240}
      saveLabel={createBrand.isPending ? "Đang lưu…" : "Lưu"}
      saveDisabled={createBrand.isPending || !name.trim()}
      onSave={save}
    >
      <FormField label="Tên thương hiệu" htmlFor="brand-create-name" required>
        <Input
          id="brand-create-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nhập tên thương hiệu"
        />
      </FormField>
    </AppModal>
  );
}
