import { cn } from "@erp/ui";
import { BoxIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface PosNotificationItemProps {
  timestamp: string;
  title: string;
  description: string;
  read?: boolean;
  showDivider?: boolean;
}

export function PosNotificationItem({
  timestamp,
  title,
  description,
  read = false,
  showDivider = true,
}: PosNotificationItemProps) {
  return (
    <div role="listitem">
      <div className="flex items-start gap-4 py-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6366F1]"
        >
          <BoxIcon size={22} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] leading-[1.4] text-gray-500">
            {timestamp}
          </div>
          <div
            className={cn(
              "mt-1 truncate text-[14px] leading-[1.45]",
              read
                ? "font-medium text-[#4A4A4A]"
                : "font-bold text-[#1F2937]",
            )}
            title={title}
          >
            {title}
          </div>
          <div
            className="mt-0.5 truncate text-[14px] leading-[1.45] text-[#4A4A4A]"
            title={description}
          >
            {description}
          </div>
        </div>
      </div>
      {showDivider ? <div className="h-px w-full bg-gray-200" /> : null}
    </div>
  );
}
