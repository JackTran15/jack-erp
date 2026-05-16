import { formatVnd } from "@erp/ui";

interface MetricColumnProps {
  faceValue: number;
  totalValue: number;
}

export function MetricColumn({ faceValue, totalValue }: MetricColumnProps) {
  return (
    <div className="flex flex-col gap-2 text-[14px] tabular-nums">
      <div className="flex items-center justify-between gap-6">
        <span className="text-[#6B7280]">Mệnh giá</span>
        <span className="text-[#1F2937]">
          {faceValue > 0 ? formatVnd(faceValue) : ""}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-[#6B7280]">Giá trị</span>
        <span className="font-semibold text-[#1F2937]">
          {formatVnd(totalValue)}
        </span>
      </div>
    </div>
  );
}
