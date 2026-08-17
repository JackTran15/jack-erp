import { cn, formatVnd } from "@erp/ui";

interface UsePointsRowProps {
  value: number;
  onChange: (next: number) => void;
  moneyFromPoints: number;
  /**
   * Số điểm đơn này còn hấp thụ được, sau khi trừ khuyến mại. Chỉ để **gợi ý** —
   * server mới là nơi chốt (bước saga `clamp-points`), và ước lượng ở đây chưa
   * tính voucher (voucher chỉ được cộng vào lúc `resolve-funds` phía server).
   * Vì vậy không chặn cứng ô nhập: nhập quá thì server tự hạ xuống, không mất điểm.
   */
  maxUsablePoints?: number;
}

export function UsePointsRow({
  value,
  onChange,
  moneyFromPoints,
  maxUsablePoints,
}: UsePointsRowProps) {
  const exceedsUsable =
    maxUsablePoints !== undefined && value > maxUsablePoints;
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
      {exceedsUsable ? (
        <p className="text-[12px] italic text-[#D97706]">
          {`Đơn này chỉ dùng được ${formatVnd(maxUsablePoints!)} điểm — phần còn lại vẫn ở trên thẻ.`}
        </p>
      ) : null}
    </div>
  );
}
