import { cn } from "@erp/ui";
import { formatViNumber } from "../../../../_lib/format";

interface Props {
  count: number;
  /** Trạng thái tiêu cực — chỉ chữ đổi màu, nền badge giữ nguyên xám (theo spec). */
  danger?: boolean;
}

/** Badge xám hiển thị số hóa đơn, tách biệt với giá trị tiền bên phải row. */
export function CountBadge({ count, danger }: Props) {
  return (
    <span
      aria-label={`Số hóa đơn: ${formatViNumber(count)}`}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-[#EEEEEE] px-2 text-xs leading-4 tabular-nums",
        danger ? "font-bold text-[#D32F2F]" : "text-[#6B6B6B]",
      )}
    >
      {formatViNumber(count)}
    </span>
  );
}
