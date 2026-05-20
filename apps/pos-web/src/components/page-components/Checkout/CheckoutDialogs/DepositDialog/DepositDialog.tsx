import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type { PaymentMethodOption } from "@erp/pos/interfaces/checkout.interface";
import type { PaymentMethod } from "@erp/pos/constants/checkout.constant";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";

interface DepositDialogProps {
  open: boolean;
  amount: number;
  method: PaymentMethod;
  methods: readonly PaymentMethodOption[];
  onClose: () => void;
  onAmountChange: (next: number) => void;
  onMethodChange: (next: PaymentMethod) => void;
  onConfirm: () => void;
}

export function DepositDialog({
  open,
  amount,
  method,
  methods,
  onClose,
  onAmountChange,
  onMethodChange,
  onConfirm,
}: DepositDialogProps) {
  return (
    <PosDialog open={open} onClose={onClose} width={560}>
      <PosDialog.Header title="Đặt cọc" />
      <PosDialog.Body className="space-y-4">
        <PosFormItem
          label="Số tiền đặt cọc"
          layout="horizontal"
          labelClassName="w-1/2"
        >
          <PosNumberInput
            value={amount}
            onChange={(next) => onAmountChange(Math.max(0, next))}
            inputMode="numeric"
            variant="underline"
            ariaLabel="Số tiền đặt cọc"
          />
        </PosFormItem>

        <PosFormItem
          label="Hình thức thanh toán"
          layout="horizontal"
          labelClassName="w-1/2"
        >
          <PosSelect
            value={methods.find((item) => item.value === method) ?? null}
            onChange={(item) => onMethodChange(item.value)}
            items={methods}
            itemKey={(item) => item.value}
            renderItem={(item) => item.label}
            ariaLabel="Hình thức thanh toán đặt cọc"
            variant="underline"
            className="w-full"
          />
        </PosFormItem>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={onConfirm}
        onCancel={onClose}
        saveLabel="Đồng ý"
        cancelLabel="Đóng"
      />
    </PosDialog>
  );
}
