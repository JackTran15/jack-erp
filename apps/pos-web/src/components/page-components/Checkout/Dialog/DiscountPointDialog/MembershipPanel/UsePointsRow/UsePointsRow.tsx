import { cn, formatVnd } from "@erp/ui";

interface UsePointsRowProps {
  value: number;
  onChange: (next: number) => void;
  moneyFromPoints: number;
}

export function UsePointsRow({
  value,
  onChange,
  moneyFromPoints,
}: UsePointsRowProps) {
  return (
    <div className="flex flex-col gap-1 border-b border-[#E5E7EB] pb-2">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="discount-point-use-input"
          className="text-[13px] font-normal text-[#1F2937]"
        >
          Sử dụng điểm
        </label>
        <input
          id="discount-point-use-input"
          type="text"
          inputMode="numeric"
          value={value === 0 ? "0" : String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            onChange(digits === "" ? 0 : Number(digits));
          }}
          className={cn(
            "w-24 bg-transparent text-right text-[14px] text-[#1F2937]",
            "focus:outline-none",
          )}
        />
      </div>
      <p className="text-[12px] italic text-[#9CA3AF]">
        {`${formatVnd(value)} điểm = ${formatVnd(moneyFromPoints)}`}
      </p>
    </div>
  );
}
