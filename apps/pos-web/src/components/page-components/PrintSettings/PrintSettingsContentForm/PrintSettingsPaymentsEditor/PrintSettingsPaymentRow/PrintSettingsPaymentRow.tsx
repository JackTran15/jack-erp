import { cn } from "@erp/ui";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { SampleInvoicePayment } from "@erp/pos/interfaces/print-sample-invoice.interface";

export interface PrintSettingsPaymentRowProps {
  payment: SampleInvoicePayment;
  onChange: (patch: Partial<Omit<SampleInvoicePayment, "id">>) => void;
  onRemove: () => void;
}

export function PrintSettingsPaymentRow({
  payment,
  onChange,
  onRemove,
}: PrintSettingsPaymentRowProps) {
  return (
    <div className="flex items-center gap-2">
      <PosTextInput
        value={payment.label}
        onChange={(next) => onChange({ label: next })}
        variant="boxed"
        placeholder="Tiền mặt"
        ariaLabel="Tên phương thức thanh toán"
        className="flex-1"
      />
      <PosNumberInput
        value={payment.amount}
        onChange={(next) => onChange({ amount: next })}
        variant="boxed"
        align="right"
        ariaLabel={`Số tiền ${payment.label}`}
        className="w-[140px] shrink-0"
      />
      <button
        type="button"
        onClick={onRemove}
        title="Xóa phương thức"
        className={cn(
          "shrink-0 rounded p-1.5 text-gray-400 transition-colors",
          "hover:bg-red-50 hover:text-red-600",
        )}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
