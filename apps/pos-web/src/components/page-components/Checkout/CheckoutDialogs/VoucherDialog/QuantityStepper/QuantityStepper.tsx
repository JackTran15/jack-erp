import { cn } from "@erp/ui";
import { MinusIcon, PlusIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { StepperButton } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/VoucherDialog/QuantityStepper/StepperButton/StepperButton";

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
}: QuantityStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const onInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      onChange(min);
      return;
    }
    const n = Number(digits);
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <div className="flex items-center gap-2">
      <StepperButton
        ariaLabel="Giảm số lượng"
        icon={<MinusIcon size={12} />}
        onClick={dec}
        disabled={value <= min}
      />
      <input
        type="text"
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onInput(e.target.value)}
        aria-label="Số lượng"
        className={cn(
          "h-6 w-12 border-b border-[#E5E7EB] bg-transparent text-center text-[14px] tabular-nums text-[#1F2937]",
          "focus:border-b-2 focus:border-[#5B5BD6] focus:outline-none",
        )}
      />
      <StepperButton
        ariaLabel="Tăng số lượng"
        icon={<PlusIcon size={12} />}
        onClick={inc}
        disabled={value >= max}
      />
    </div>
  );
}
