import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@erp/ui";
import { Check, Download, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import type { IssuableTransferOrderListItem } from "@erp/shared-interfaces";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";

/** Full transfer-order detail (GET /inventory/transfer-orders/:id) used to prefill the form. */
export interface TransferOrderDetailLine {
  itemId: string;
  requestedQty: string | number;
  sourceStorageId?: string | null;
  /** Source bin resolved by the backend (the source storage's default location). */
  sourceLocationId?: string | null;
  sourceLocationCode?: string | null;
  note?: string | null;
  item?: {
    id: string;
    code: string;
    name: string;
    unit?: string;
    purchasePrice?: number | string | null;
  } | null;
}

export interface TransferOrderDetail {
  id: string;
  documentNumber?: string;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string | null;
  destinationStorageId?: string | null;
  notes?: string | null;
  lines: TransferOrderDetailLine[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen transfer order detail + its picker row (for inlined names). */
  onSelect: (
    detail: TransferOrderDetail,
    row: IssuableTransferOrderListItem,
  ) => void;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Chưa thực hiện",
  IN_PROGRESS: "Đang luân chuyển",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const dateFmt = new Intl.DateTimeFormat("vi-VN");

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function firstOfMonth(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

function lastOfMonth(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function SelectTransferOrderDialog({ open, onClose, onSelect }: Props) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(lastOfMonth);
  const [rows, setRows] = useState<IssuableTransferOrderListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { data } = await apiClient.get<IssuableTransferOrderListItem[]>(
        `/inventory/transfer-orders/issuable?${params}`,
      );
      setRows(data);
      setSelectedId(null);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  // Load the current month's issuable orders when the picker opens; reset on close.
  useEffect(() => {
    if (open) {
      void load();
    } else {
      setRows(null);
      setSelectedId(null);
    }
    // load is intentionally excluded — re-fetch is driven by the "Lấy dữ liệu" button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    const row = rows?.find((r) => r.id === selectedId);
    if (!row) return;
    setConfirming(true);
    try {
      const { data } = await apiClient.get<TransferOrderDetail>(
        `/inventory/transfer-orders/${selectedId}`,
      );
      onSelect(data, row);
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-[920px]">
        <DialogHeader>
          <DialogTitle>Chọn lệnh điều chuyển</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Từ ngày</label>
            <Input
              type="date"
              className="w-[170px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Đến ngày</label>
            <Input
              type="date"
              className="w-[170px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            <Download className="mr-1 h-4 w-4" />
            Lấy dữ liệu
          </Button>
        </div>

        <div className="max-h-[360px] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-muted-foreground [&_th]:bg-muted">
              <tr>
                <th className="w-10 p-2" />
                <th className="p-2 text-left font-medium">Ngày</th>
                <th className="p-2 text-left font-medium">Số chứng từ</th>
                <th className="p-2 text-left font-medium">Lý do</th>
                <th className="p-2 text-left font-medium">Điều chuyển đến</th>
                <th className="p-2 text-left font-medium">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Đang tải…
                  </td>
                </tr>
              ) : !rows || rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-10 w-10 opacity-40" />
                    <div className="font-medium">KHÔNG CÓ DỮ LIỆU</div>
                    <div className="text-xs">
                      Vui lòng tìm kiếm lệnh điều chuyển để xuất kho
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-border hover:bg-muted/40"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="radio"
                        name="transfer-order-pick"
                        checked={selectedId === r.id}
                        onChange={() => setSelectedId(r.id)}
                      />
                    </td>
                    <td className="p-2">{formatDate(r.requestedDate)}</td>
                    <td className="p-2 font-mono">{r.documentNumber}</td>
                    <td className="p-2">{r.notes ?? "—"}</td>
                    <td className="p-2">{r.destinationBranchName}</td>
                    <td className="p-2">{STATUS_LABELS[r.status] ?? r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!selectedId || confirming}
          >
            <Check className="mr-1 h-4 w-4" />
            Chọn
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
