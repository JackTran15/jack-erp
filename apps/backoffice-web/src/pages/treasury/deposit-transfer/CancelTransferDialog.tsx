import { useEffect, useState } from "react";
import type { DepositTransfer } from "@erp/shared-interfaces";
import { AppModal, Button, Textarea, formatMoneyInteger } from "@erp/ui";
import { toast } from "sonner";
import { useCancelDepositTransfer } from "../../../hooks/treasury/use-deposit-transfers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: DepositTransfer | null;
  /** Resolved by the list page (which already maps branchId → name for its columns). */
  toBranchName?: string;
}

/**
 * BR-TRF-03 — only while `DANG_CHUYEN`. If B has already confirmed in the
 * gap between page load and this click, the backend rejects with 409/400;
 * that message is surfaced via the toast below rather than pre-guessed here.
 */
export function CancelTransferDialog({ open, onOpenChange, transfer, toBranchName }: Props) {
  const cancel = useCancelDepositTransfer();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const handleCancel = async () => {
    if (!transfer) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error("Nhập lý do hủy.");
      return;
    }
    try {
      await cancel.mutateAsync({ id: transfer.id, body: { reason: trimmed } });
      toast.success("Đã hủy chuyển tiền.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hủy chuyển tiền thất bại.");
    }
  };

  if (!open || !transfer) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Hủy chuyển tiền"
      bodyStretch={false}
      defaultWidth={460}
      defaultHeight={300}
      minWidth={380}
      minHeight={280}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={cancel.isPending || !reason.trim()}
            onClick={() => void handleCancel()}
          >
            {cancel.isPending ? "Đang xử lý…" : "Hủy chuyển tiền"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground leading-relaxed">
          Hủy khoản chuyển <strong>{formatMoneyInteger(Number(transfer.amount))}</strong>
          {toBranchName ? ` tới chi nhánh ${toBranchName}` : ""}. Số tiền sẽ được hoàn lại quỹ
          tiền gửi của chi nhánh nguồn. Chỉ hủy được khi chi nhánh đích chưa xác nhận nhận.
        </p>
        <label className="text-sm font-medium">Lý do hủy</label>
        <Textarea
          className="min-h-[64px] resize-none"
          value={reason}
          maxLength={500}
          placeholder="Bắt buộc nhập lý do hủy…"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </AppModal>
  );
}
