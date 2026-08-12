import { useMemo, useState } from "react";
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
import { LookupField } from "../forms/LookupField";
import {
  STORAGE_LOOKUP_COLUMNS,
  makeStorageSearch,
} from "../forms/storage-lookup";

export interface ChooseWarehouseOption {
  id: string;
  /** Mã kho (WHxxxxxx) — cột thứ nhất của dropdown chọn kho. */
  code?: string;
  name: string;
  /** false = kho đã ngừng hoạt động → ẩn khỏi picker. Bỏ trống coi như đang hoạt động. */
  isActive?: boolean;
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

  // Ẩn kho đã ngừng hoạt động (isActive === false) khỏi picker.
  const activeStorages = storages.filter((s) => s.isActive !== false);
  const [storageLabel, setStorageLabel] = useState(
    () => activeStorages.find((s) => s.id === defaultStorageId)?.name ?? "",
  );

  const searchStorages = useMemo(
    () => makeStorageSearch(activeStorages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storages],
  );

  const handleConfirm = () => {
    const storage = activeStorages.find((s) => s.id === storageId);
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
      <DialogContent overlayClassName="z-[70]" className="z-[80] max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Chọn kho</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Label htmlFor="choose-warehouse-select" className="shrink-0">
            {fieldLabel} <span className="text-destructive">*</span>
          </Label>
          <div className="flex-1">
            <LookupField<ChooseWarehouseOption>
              inputId="choose-warehouse-select"
              placeholder="Chọn kho"
              dropdownMinWidth={420}
              value={storageLabel}
              onValueChange={(v) => {
                setStorageLabel(v);
                if (!v) setStorageId("");
              }}
              onSelect={(s) => {
                setStorageId(s.id);
                setStorageLabel(s.name);
              }}
              search={searchStorages}
              itemKey={(s) => s.id}
              renderItem={(s) => s.name}
              columns={STORAGE_LOOKUP_COLUMNS}
            />
          </div>
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
