import { useEffect, useState } from "react";
import { AppModal, Button, DateTimeField, FormField, Input, MoneyInput } from "@erp/ui";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { useMyBranchCashAccount } from "../../../../hooks/treasury/use-cash-accounts";
import { useFundSwapMutation } from "../../../../hooks/treasury/use-fund-swap";
import { FundSwapDirection, type CreateFundSwapBody } from "../../bank-vouchers.types";
import { DepositAccountSelect } from "../_shared/DepositAccountSelect";

const DIRECTION_OPTIONS = [
  { value: FundSwapDirection.CASH_TO_DEPOSIT, label: "Tiền mặt → Tiền gửi" },
  { value: FundSwapDirection.DEPOSIT_TO_CASH, label: "Tiền gửi → Tiền mặt" },
] as const;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FundSwapDialog({ open, onOpenChange }: Props) {
  const { data: cashAccount } = useMyBranchCashAccount();
  const swap = useFundSwapMutation();

  const [direction, setDirection] = useState<FundSwapDirection>(FundSwapDirection.CASH_TO_DEPOSIT);
  const [depositAccountId, setDepositAccountId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [docDate, setDocDate] = useState(toIsoDate(new Date()));
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setDirection(FundSwapDirection.CASH_TO_DEPOSIT);
    setDepositAccountId("");
    setAmount(0);
    setFeeAmount(0);
    setDocDate(toIsoDate(new Date()));
    setReason("");
  }, [open]);

  const isWithdrawal = direction === FundSwapDirection.DEPOSIT_TO_CASH;

  const handleConfirm = async () => {
    if (!depositAccountId) {
      toast.error("Vui lòng chọn tài khoản tiền gửi.");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Số tiền chuyển phải lớn hơn 0.");
      return;
    }
    const body: CreateFundSwapBody = {
      direction,
      depositAccountId,
      cashAccountId: cashAccount?.id,
      amount,
      docDate,
      feeAmount: isWithdrawal && feeAmount > 0 ? feeAmount : undefined,
      reason: reason || undefined,
    };
    try {
      await swap.mutateAsync(body);
      toast.success("Đã chuyển quỹ.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chuyển quỹ thất bại.");
    }
  };

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Chuyển quỹ tiền mặt ↔ tiền gửi"
      bodyStretch={false}
      defaultWidth={520}
      defaultHeight={420}
      minWidth={420}
      minHeight={380}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
          <Button type="button" disabled={swap.isPending} onClick={() => void handleConfirm()}>
            <Check className="mr-1 h-4 w-4" />
            {swap.isPending ? "Đang xử lý…" : "Chuyển quỹ"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label="Chiều chuyển" layout="horizontal" labelWidth="8rem">
          <RadioGroup
            name="fund-swap-direction"
            value={direction}
            options={DIRECTION_OPTIONS}
            onChange={setDirection}
          />
        </FormField>
        <FormField label="Tài khoản tiền mặt" layout="horizontal" labelWidth="8rem">
          <Input value={cashAccount?.name ?? ""} readOnly disabled className="bg-muted/30" />
        </FormField>
        <FormField label="Tài khoản tiền gửi" required layout="horizontal" labelWidth="8rem">
          <DepositAccountSelect value={depositAccountId} onChange={setDepositAccountId} />
        </FormField>
        <FormField label="Số tiền" required layout="horizontal" labelWidth="8rem">
          <MoneyInput value={amount} onChange={(v) => setAmount(v === "" ? 0 : Number(v))} />
        </FormField>
        {isWithdrawal ? (
          <FormField label="Phí rút tiền" layout="horizontal" labelWidth="8rem">
            <MoneyInput value={feeAmount} onChange={(v) => setFeeAmount(v === "" ? 0 : Number(v))} />
          </FormField>
        ) : null}
        <FormField label="Ngày chứng từ" required layout="horizontal" labelWidth="8rem">
          <DateTimeField value={docDate} onChange={(e) => setDocDate(e.target.value)} includeTime={false} />
        </FormField>
        <FormField label="Lý do" layout="horizontal" labelWidth="8rem">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Không bắt buộc" />
        </FormField>
      </div>
    </AppModal>
  );
}
