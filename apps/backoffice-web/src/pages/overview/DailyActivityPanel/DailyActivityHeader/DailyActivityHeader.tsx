import { formatViDateTimeShort } from "../../_lib/format";
import { RefreshIconButton } from "../../RefreshIconButton/RefreshIconButton";

interface Props {
  updatedAt?: Date;
  scopeLabel: string;
  onRefresh: () => void;
  refreshing?: boolean;
}

/** Header của panel row 1: tiêu đề + thời điểm dữ liệu + kho đang chọn + ⟳. */
export function DailyActivityHeader({
  updatedAt,
  scopeLabel,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div className="flex h-12 items-center justify-between gap-4 border-b border-[#E0E0E0] px-4">
      <h2 className="truncate text-[13px] leading-5 text-[#616161]">
        Hoạt động trong ngày {updatedAt ? formatViDateTimeShort(updatedAt) : "—"}{" "}
        <strong className="font-medium text-[#212121]">({scopeLabel})</strong>
      </h2>
      <RefreshIconButton onClick={onRefresh} loading={refreshing} />
    </div>
  );
}
