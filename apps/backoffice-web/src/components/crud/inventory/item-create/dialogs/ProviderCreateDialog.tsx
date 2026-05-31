import { useEffect, useState } from "react";
import { AppModal, FormField, Input } from "@erp/ui";
import { toast } from "sonner";
import { useCreateProvider } from "../hooks";
import { getUserFacingApiErrorMessage } from "../../../../../lib/user-facing-api-error";

export interface ProviderPick {
  id: string;
  code: string;
  name: string;
  address: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (provider: ProviderPick) => void;
}

/** Quick-create a supplier (Nhà cung cấp) inline from the providers table (+ button). */
export function ProviderCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const createProvider = useCreateProvider();

  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
    }
  }, [open]);

  const save = async () => {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) {
      toast.warning("Vui lòng nhập mã và tên nhà cung cấp.");
      return;
    }
    try {
      const created = (await createProvider.mutateAsync({
        code: trimmedCode,
        name: trimmedName,
        isActive: true,
      })) as Record<string, unknown>;
      onCreated({
        id: String(created.id ?? ""),
        code: String(created.code ?? trimmedCode),
        name: String(created.name ?? trimmedName),
        address: String(created.address ?? ""),
      });
      onOpenChange(false);
      toast.success("Đã tạo nhà cung cấp.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Thêm nhà cung cấp mới"
      defaultWidth={560}
      defaultHeight={340}
      saveLabel={createProvider.isPending ? "Đang lưu…" : "Lưu"}
      saveDisabled={createProvider.isPending || !code.trim() || !name.trim()}
      onSave={save}
    >
      <div className="grid gap-3">
        <FormField label="Mã nhà cung cấp" htmlFor="prov-code" required>
          <Input id="prov-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        <FormField label="Tên nhà cung cấp" htmlFor="prov-name" required>
          <Input id="prov-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </div>
    </AppModal>
  );
}
