import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@erp/ui";

/**
 * Dấu "?" cạnh tiêu đề mỗi thẻ, hover ra phần giải thích cách thẻ đó chọn người
 * nhận và bỏ qua những bước nào.
 *
 * Ba thẻ chọn người nhận theo ba cách khác hẳn nhau, và đó là nguồn hiểu nhầm
 * số một khi dò: bấm thẻ ③ rồi chờ máy mình rung, trong khi thẻ ③ không hề biết
 * tới cái máy đó. Giải thích phải nằm NGAY cạnh nút, không nằm trong tài liệu.
 *
 * `TooltipProvider` bọc tại chỗ theo đúng khuôn của `AppSidebar` — app chưa có
 * một provider chung ở gốc.
 */
export function HelpTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            // `type="button"` để không submit form nào; con trỏ help nói ra là
            // chạm vào không xảy ra chuyện gì.
            className="cursor-help text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="max-w-sm space-y-2 p-3 text-xs leading-relaxed"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
