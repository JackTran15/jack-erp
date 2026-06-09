import { useEffect, useState } from "react";
import { AppModal, Button, FormField } from "@erp/ui";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import type {
  PaginatedResponse,
  StockTakeLine,
  StockTakeMember,
  StorageOption,
} from "./stock-takes.types";

export interface StockTakeDraft {
  storageId: string;
  storageName: string;
  plannedDate: string;
  countedAt?: string;
  purpose?: string;
  conclusion?: string;
  countByValue?: boolean;
  mergeSourceIds?: string[];
  lines?: StockTakeLine[];
  members?: StockTakeMember[];
}

interface Props {
  onClose: () => void;
  /** Fired when the user confirms the warehouse + date. NO API call has been made yet. */
  onPicked: (draft: StockTakeDraft) => void;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Active branch the user is scoped to — same source as the X-Branch-Id header. */
function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

export function CreateStockTakeDialog({ onClose, onPicked }: Props) {
  const [storages, setStorages] = useState<StorageOption[]>([]);
  const [storageId, setStorageId] = useState<string>("");
  const [plannedDate, setPlannedDate] = useState<string>(todayIso());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "200" });
        const branchId = getActiveBranchId();
        if (branchId) params.set("branchId", branchId);
        const { data } = await apiClient.get<PaginatedResponse<StorageOption>>(
          `/inventory/storages?${params}`,
        );
        if (!cancelled) setStorages(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = () => {
    if (!storageId) {
      toast.error("Vui lòng chọn kho cần kiểm kê.");
      return;
    }
    if (!plannedDate) {
      toast.error("Vui lòng chọn ngày kiểm kê.");
      return;
    }
    const storage = storages.find((s) => s.id === storageId);
    onPicked({
      storageId,
      storageName: storage?.name ?? "",
      plannedDate,
    });
  };

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Kiểm kê kho"
      className="max-w-[520px]"
      showFooter={false}
    >
      <div className="flex flex-col gap-4 p-1">
        <FormField label="Kiểm kê tại kho *">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
        </FormField>

        <FormField label="Kiểm kê đến ngày *">
          <input
            type="date"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={plannedDate}
            onChange={(e) => setPlannedDate(e.target.value)}
          />
        </FormField>

        <div className="mt-2 flex items-center justify-end gap-2 border-t pt-3">
          <Button type="button" onClick={handleSubmit} disabled={!storageId}>
            Kiểm kê kho
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ bỏ
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
