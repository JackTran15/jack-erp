import { useEffect, useState } from "react";
import { AppModal, Button, Textarea, formatMoneyInteger } from "@erp/ui";
import { toast } from "sonner";
import { useCancelCashTransfer } from "../../../hooks/treasury/use-cash-transfers";
import type { CashTransfer } from "./cash-transfer.types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: CashTransfer | null;
  /** Resolved by the list page (which already maps branchId → name for its columns). */
  toBranchName?: string;
}

/**
 * Only while `DANG_CHUYEN`. If the destination branch confirms in the gap
 * between page load and this click, the backend rejects with 409; that message
 * is surfaced via the toast below rather than pre-guessed here.
 */
export function CancelCashTransferDialog({
  open,
  onOpenChange,
  transfer,
  toBranchName,
}: Props) {
  const cancel = useCancelCashTransfer();
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
      title="Hủy chuyển tiền mặt"
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
          {toBranchName ? ` tới cửa hàng ${toBranchName}` : ""}. Phiếu chi sẽ được đảo và
          số tiền hoàn lại quỹ tiền mặt của cửa hàng nguồn. Chỉ hủy được khi cửa hàng nhận
          chưa xác nhận.
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
