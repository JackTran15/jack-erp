import type { ReactNode } from "react";
import { RefreshIconButton } from "../../RefreshIconButton/RefreshIconButton";
import { SettingsIconButton } from "../../SettingsIconButton/SettingsIconButton";

interface Props {
  /** Tiêu đề: chuỗi (row 2) hoặc `WidgetTypeSelect` (row 3). */
  title: ReactNode;
  /** Dropdown kỳ báo cáo nhanh. */
  periodSelect: ReactNode;
  onOpenOptions: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

/** Header 48px của mọi widget chart: tiêu đề trái, nhóm action phải. */
export function WidgetHeader({
  title,
  periodSelect,
  onOpenOptions,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[#E0E0E0] pl-4 pr-3">
      {typeof title === "string" ? (
        <h3 className="truncate text-[13px] leading-5 text-[#616161]">{title}</h3>
      ) : (
        title
      )}
      <div className="flex shrink-0 items-center gap-2">
        {periodSelect}
        <div className="flex items-center gap-1">
          <SettingsIconButton onClick={onOpenOptions} />
          <RefreshIconButton onClick={onRefresh} loading={refreshing} />
        </div>
      </div>
    </div>
  );
}
