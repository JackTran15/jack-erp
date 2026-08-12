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
import type { ChooseWarehouseOption } from "./ChooseWarehouseDialog";

interface Props {
  /** Warehouse options to pick from (shared list for both fields). */
  storages: ChooseWarehouseOption[];
  defaultSourceId?: string;
  defaultDestId?: string;
  onClose: () => void;
  /** Fired with both chosen warehouses. The caller applies them to every line. */
  onConfirm: (selection: {
    source: ChooseWarehouseOption;
    dest: ChooseWarehouseOption;
  }) => void;
}

export function ChooseTransferWarehousesDialog({
  storages,
  defaultSourceId = "",
  defaultDestId = "",
  onClose,
  onConfirm,
}: Props) {
  const [sourceId, setSourceId] = useState(defaultSourceId);
  const [destId, setDestId] = useState(defaultDestId);
  const nameOf = (id: string) => storages.find((s) => s.id === id)?.name ?? "";
  const [sourceLabel, setSourceLabel] = useState(() => nameOf(defaultSourceId));
  const [destLabel, setDestLabel] = useState(() => nameOf(defaultDestId));

  const searchStorages = useMemo(() => makeStorageSearch(storages), [storages]);

  const handleConfirm = () => {
    const source = storages.find((s) => s.id === sourceId);
    const dest = storages.find((s) => s.id === destId);
    if (!source || !dest) {
      toast.error("Vui lòng chọn kho xuất và kho nhập.");
      return;
    }
    onConfirm({ source, dest });
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent overlayClassName="z-[70]" className="z-[80] max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Chọn kho</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[90px_1fr] items-center gap-3">
            <Label htmlFor="transfer-source-select">
              Kho xuất <span className="text-destructive">*</span>
            </Label>
            <LookupField<ChooseWarehouseOption>
              inputId="transfer-source-select"
              placeholder="Chọn kho"
              dropdownMinWidth={420}
              value={sourceLabel}
              onValueChange={(v) => {
                setSourceLabel(v);
                if (!v) setSourceId("");
              }}
              onSelect={(s) => {
                setSourceId(s.id);
                setSourceLabel(s.name);
              }}
              search={searchStorages}
              itemKey={(s) => s.id}
              renderItem={(s) => s.name}
              columns={STORAGE_LOOKUP_COLUMNS}
            />

            <Label htmlFor="transfer-dest-select">
              Kho nhập <span className="text-destructive">*</span>
            </Label>
            <LookupField<ChooseWarehouseOption>
              inputId="transfer-dest-select"
              placeholder="Chọn kho"
              dropdownMinWidth={420}
              value={destLabel}
              onValueChange={(v) => {
                setDestLabel(v);
                if (!v) setDestId("");
              }}
              onSelect={(s) => {
                setDestId(s.id);
                setDestLabel(s.name);
              }}
              search={searchStorages}
              itemKey={(s) => s.id}
              renderItem={(s) => s.name}
              columns={STORAGE_LOOKUP_COLUMNS}
            />

          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!sourceId || !destId}
          >
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
