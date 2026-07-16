import { useEffect, useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  AppModal,
  Button,
  DateTimeField,
  FormField,
  MoneyInput,
  Textarea,
  formatMoneyInteger,
} from "@erp/ui";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { ReconcileBody, ReconcileResponse } from "./deposit-recon.types";
import { DepositReconBatchStatus } from "./deposit-recon.types";
import { RECON_BATCH_STATUS_LABEL } from "./deposit-recon.labels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  depositAccountId: string;
  movementIds: string[];
  /** Client-side sum of the selected rows' `netAmount` — a live preview only; the
   * authoritative `systemTotalAmount` is always computed and returned by the server. */
  selectedNetTotal: number;
  reconcile: UseMutationResult<ReconcileResponse, unknown, ReconcileBody>;
  /** Called after the user closes a successful result (clears the page's selection). */
  onDone: () => void;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DepositReconBatchDialog({
  open,
  onOpenChange,
  depositAccountId,
  movementIds,
  selectedNetTotal,
  reconcile,
  onDone,
}: Props) {
  const [stmtFromDate, setStmtFromDate] = useState(today());
  const [stmtToDate, setStmtToDate] = useState(today());
  const [stmtTotalAmount, setStmtTotalAmount] = useState<number | "">(round2(selectedNetTotal));
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ReconcileResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setStmtFromDate(today());
    setStmtToDate(today());
    setStmtTotalAmount(round2(selectedNetTotal));
    setNote("");
    setResult(null);
  }, [open, selectedNetTotal]);

  // Client-side preview only — the server always recomputes `systemTotalAmount`
  // from the selected movements' `net_amount` at commit time (BR-REC-02/03).
  const previewDiff = useMemo(() => {
    if (stmtTotalAmount === "") return 0;
    return round2(Number(stmtTotalAmount) - selectedNetTotal);
  }, [stmtTotalAmount, selectedNetTotal]);

  const noteRequired = previewDiff !== 0;
  const canSubmit =
    movementIds.length > 0 && stmtTotalAmount !== "" && (!noteRequired || note.trim().length > 0);

  const handleSubmit = async () => {
    if (stmtTotalAmount === "") return;
    try {
      const res = await reconcile.mutateAsync({
        depositAccountId,
        movementIds,
        stmtTotalAmount: Number(stmtTotalAmount),
        stmtFromDate,
        stmtToDate,
        note: note.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      // BR-REC-02 fallback — server rejects a discrepancy without a note even
      // if the client-side preview somehow missed it (e.g. stale selection).
      toast.error(e instanceof Error ? e.message : "Đối chiếu thất bại.");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (result) onDone();
  };

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      title="Đối chiếu tiền gửi"
      bodyStretch={false}
      defaultWidth={480}
      defaultHeight={result ? 360 : 420}
      minWidth={400}
      minHeight={320}
      footer={
        result ? (
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || reconcile.isPending}
              onClick={() => void handleSubmit()}
            >
              {reconcile.isPending ? "Đang xử lý…" : "Xác nhận đối chiếu"}
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {result.status === DepositReconBatchStatus.RECONCILED ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <TriangleAlert className="h-5 w-5 text-amber-600" />
            )}
            <span className="text-base font-semibold">
              {RECON_BATCH_STATUS_LABEL[result.status]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Số tiền hệ thống</span>
            <span className="text-right tabular-nums">
              {formatMoneyInteger(result.systemTotalAmount)}
            </span>
            <span className="text-muted-foreground">Số tiền sao kê</span>
            <span className="text-right tabular-nums">
              {formatMoneyInteger(Number(result.batch.stmtTotalAmount))}
            </span>
            <span className="text-muted-foreground">Chênh lệch</span>
            <span className="text-right font-semibold tabular-nums">
              {formatMoneyInteger(result.diffAmount)}
            </span>
          </div>
          {result.proposalId ? (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
              Đã tạo đề xuất điều chỉnh phí (nháp, mã {result.proposalId}) — cần duyệt riêng ở
              phiếu chi tiền gửi. Số dư quỹ tiền gửi <strong>chưa</strong> thay đổi.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {movementIds.length} giao dịch đã chọn · Tổng thực nhận theo hệ thống:{" "}
            <strong>{formatMoneyInteger(selectedNetTotal)}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Từ ngày sao kê" required>
              <DateTimeField
                value={stmtFromDate}
                onChange={(e) => setStmtFromDate(e.target.value)}
              />
            </FormField>
            <FormField label="Đến ngày sao kê" required>
              <DateTimeField value={stmtToDate} onChange={(e) => setStmtToDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Tổng tiền theo sao kê" required>
            <MoneyInput value={stmtTotalAmount} onChange={setStmtTotalAmount} />
          </FormField>
          {noteRequired ? (
            <p className="text-xs text-amber-600">
              Chênh lệch dự kiến: {formatMoneyInteger(previewDiff)} — bắt buộc nhập ghi chú trước
              khi gửi.
            </p>
          ) : null}
          <FormField label="Ghi chú lệch" required={noteRequired}>
            <Textarea
              className="min-h-[64px] resize-none"
              value={note}
              maxLength={1000}
              placeholder="Bắt buộc khi số tiền sao kê không khớp hệ thống…"
              onChange={(e) => setNote(e.target.value)}
            />
          </FormField>
        </div>
      )}
    </AppModal>
  );
}
