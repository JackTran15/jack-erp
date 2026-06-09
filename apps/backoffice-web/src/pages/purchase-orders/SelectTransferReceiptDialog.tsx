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
import type { ImportableTransferOrderListItem } from "@erp/shared-interfaces";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";

/** Full transfer-order detail (GET /inventory/transfer-orders/:id) used to prefill the receipt. */
export interface TransferReceiptDetailLine {
  itemId: string;
  requestedQty: string | number;
  note?: string | null;
  item?: {
    id: string;
    code: string;
    name: string;
    unit?: string;
    purchasePrice?: number | string | null;
  } | null;
}

export interface TransferReceiptDetail {
  id: string;
  documentNumber?: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string | null;
  lines: TransferReceiptDetailLine[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen transfer order detail + its picker row (for inlined names). */
  onSelect: (
    detail: TransferReceiptDetail,
    row: ImportableTransferOrderListItem,
  ) => void;
}

const moneyFmt = new Intl.NumberFormat("vi-VN");
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

function today(): string {
  return ymd(new Date());
}

export function SelectTransferReceiptDialog({ open, onClose, onSelect }: Props) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ImportableTransferOrderListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const { data } = await apiClient.get<ImportableTransferOrderListItem[]>(
        `/inventory/transfer-orders/importable?${params}`,
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

  // Load today's importable docs when the picker opens; reset on close.
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
      const { data } = await apiClient.get<TransferReceiptDetail>(
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
      <DialogContent className="max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Chọn chứng từ xuất kho điều chuyển</DialogTitle>
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
            <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
              <tr>
                <th className="w-10 p-2" />
                <th className="p-2 text-left font-medium">Ngày</th>
                <th className="p-2 text-left font-medium">Số chứng từ</th>
                <th className="p-2 text-right font-medium">Tổng thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Đang tải…
                  </td>
                </tr>
              ) : !rows || rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-muted-foreground">
                    <Inbox className="mx-auto mb-2 h-10 w-10 opacity-40" />
                    <div className="font-medium">KHÔNG CÓ DỮ LIỆU</div>
                    <div className="text-xs">
                      Vui lòng tìm kiếm chứng từ điều chuyển để nhập kho
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
                        name="transfer-receipt-pick"
                        checked={selectedId === r.id}
                        onChange={() => setSelectedId(r.id)}
                      />
                    </td>
                    <td className="p-2">{formatDate(r.requestedDate)}</td>
                    <td className="p-2 font-mono">
                      {r.exportGoodsIssueDocumentNumber ?? r.documentNumber}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {moneyFmt.format(r.totalAmount)}
                    </td>
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
