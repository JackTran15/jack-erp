import { formatViNumber } from "../../../../_lib/format";

interface Props {
  count: number;
}

/** Badge xám hiển thị số hóa đơn, tách biệt với giá trị tiền bên phải row. */
export function CountBadge({ count }: Props) {
  return (
    <span
      aria-label={`Số hóa đơn: ${formatViNumber(count)}`}
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-[#EEEEEE] px-2 text-xs leading-4 tabular-nums text-[#6B6B6B]"
    >
      {formatViNumber(count)}
    </span>
  );
}
