import { Button, Input, cn } from "@erp/ui";
import { RadioGroup } from "../../../../../components/forms/RadioGroup";
import type { LedgerCashVoucherDetail } from "../../ledger-cash.types";
import { LedgerCashVoucherPaymentModeEnum } from "../../ledger-cash.types";
import { READONLY_INPUT_CLASS } from "../../ledger-cash.constants";
import { PAYMENT_VOUCHER_MODE_OPTIONS } from "./payment-voucher-dialog.constants";

interface Props {
  detail: LedgerCashVoucherDetail;
}

export function PaymentVoucherOptionsBar({ detail }: Props) {
  const paymentMode =
    detail.paymentMode ?? LedgerCashVoucherPaymentModeEnum.PAY_NOW;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <RadioGroup
          name="payment-mode"
          value={paymentMode}
          readOnly
          options={[...PAYMENT_VOUCHER_MODE_OPTIONS]}
        />
        <Input
          readOnly
          value={detail.paymentMethod ?? "Tiền mặt"}
          className={cn("h-8 w-28", READONLY_INPUT_CLASS)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="pointer-events-none"
        >
          Chọn phiếu đặt hàng
        </Button>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            readOnly
            checked={detail.receiveWithInvoice ?? false}
            disabled
            className="accent-primary disabled:accent-muted-foreground"
          />
          Nhận kèm hóa đơn
        </label>
      </div>
    </div>
  );
}
