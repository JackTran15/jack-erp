import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@erp/ui";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export interface ChooseWarehouseOption {
  id: string;
  name: string;
}

interface Props {
  /** Warehouse options to pick from. */
  storages: ChooseWarehouseOption[];
  /** Warehouse pre-selected when the dialog opens. */
  defaultStorageId?: string;
  /** Label of the single select field (e.g. "Kho nhập", "Kho xuất"). */
  fieldLabel?: string;
  onClose: () => void;
  /** Fired with the chosen warehouse. The caller applies it to every line. */
  onConfirm: (storage: ChooseWarehouseOption) => void;
}

export function ChooseWarehouseDialog({
  storages,
  defaultStorageId = "",
  fieldLabel = "Kho",
  onClose,
  onConfirm,
}: Props) {
  const [storageId, setStorageId] = useState(defaultStorageId);

  const handleConfirm = () => {
    const storage = storages.find((s) => s.id === storageId);
    if (!storage) {
      toast.error("Vui lòng chọn kho.");
      return;
    }
    onConfirm(storage);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Chọn kho</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label htmlFor="choose-warehouse-select" className="shrink-0">
            {fieldLabel} <span className="text-destructive">*</span>
          </Label>
          <select
            id="choose-warehouse-select"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
            autoFocus
          >
            <option value="">— Chọn kho —</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleConfirm} disabled={!storageId}>
            <Check className="mr-1 h-4 w-4" />
            Đồng ý
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
