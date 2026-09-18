import { cn } from "@erp/ui";
import { formatViNumber } from "../../../_lib/format";
import { CountBadge } from "../../DailyActivityCard/DailyActivityRow/CountBadge/CountBadge";

interface Props {
  label: string;
  value: number;
  /** Có giá trị → dòng chia 3 cột và hiện badge số lượng hóa đơn. */
  count?: number;
  danger?: boolean;
  /** Dòng "Tổng": in đậm, không thụt lề, không badge. */
  isTotal?: boolean;
  /** Bề rộng cột nhãn khi có badge — để badge của các dòng con thẳng cột. */
  labelWidth: number;
}

/** Một dòng trong modal chi tiết: nhãn ‖ (badge) ‖ số tiền. */
export function BreakdownRow({
  label,
  value,
  count,
  danger,
  isTotal,
  labelWidth,
}: Props) {
  const text = danger ? "text-[#D32F2F]" : isTotal ? "text-[#212121]" : "text-[#333333]";
  const amount = (
    <span
      className={cn(
        "whitespace-nowrap text-[13px] font-bold leading-5 tabular-nums",
        text,
      )}
    >
      {formatViNumber(value)}
    </span>
  );

  // Dòng "Tổng" chỉ có nhãn + số nên dùng flex; grid với cột `1fr` + `truncate`
  // có thể co cột nhãn về 0 và nuốt mất chữ "Tổng".
  if (isTotal) {
    return (
      <div className="flex h-10 items-center justify-between gap-4 border-b border-[#E0E0E0] pl-3 pr-5">
        <span className={cn("whitespace-nowrap text-[13px] font-bold leading-5", text)}>
          {label}
        </span>
        {amount}
      </div>
    );
  }

  return (
    <div
      className="grid h-9 items-center gap-2 pl-8 pr-5"
      style={{
        gridTemplateColumns:
          count === undefined ? "minmax(0,1fr) auto" : `${labelWidth}px auto 1fr`,
      }}
    >
      <span className={cn("truncate text-[13px] leading-5", text)}>{label}</span>
      {count === undefined ? null : <CountBadge count={count} danger={danger} />}
      <span className="justify-self-end">{amount}</span>
    </div>
  );
}
