import { useEffect, useState } from "react";
import type { DepositTransfer } from "@erp/shared-interfaces";
import { AppModal, Button, Textarea, formatMoneyInteger } from "@erp/ui";
import { toast } from "sonner";
import { useConfirmDepositTransfer } from "../../../hooks/treasury/use-deposit-transfers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: DepositTransfer | null;
  /** Resolved by the list page (which already maps branchId → name for its columns). */
  fromBranchName?: string;
}

export function ConfirmReceiptDialog({ open, onOpenChange, transfer, fromBranchName }: Props) {
  const confirm = useConfirmDepositTransfer();
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  const handleConfirm = async () => {
    if (!transfer) return;
    try {
      await confirm.mutateAsync({ id: transfer.id, body: { note: note.trim() || undefined } });
      toast.success("Đã xác nhận nhận tiền — trạng thái Hoàn tất.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xác nhận thất bại.");
    }
  };

  if (!open || !transfer) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Xác nhận nhận tiền"
      bodyStretch={false}
      defaultWidth={460}
      defaultHeight={280}
      minWidth={380}
      minHeight={260}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại
          </Button>
          <Button type="button" disabled={confirm.isPending} onClick={() => void handleConfirm()}>
            {confirm.isPending ? "Đang xử lý…" : "Xác nhận nhận"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground leading-relaxed">
          Xác nhận đã nhận <strong>{formatMoneyInteger(Number(transfer.amount))}</strong>
          {fromBranchName ? ` từ chi nhánh ${fromBranchName}` : ""}. Số tiền sẽ được cộng vào quỹ
          tiền gửi của chi nhánh này và khoản tiền đang chuyển sẽ được đóng.
        </p>
        <label className="text-sm font-medium">Ghi chú</label>
        <Textarea
          className="min-h-[64px] resize-none"
          value={note}
          maxLength={500}
          placeholder="Không bắt buộc"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </AppModal>
  );
}
