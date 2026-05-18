import { cn } from "@erp/ui";
import type { ReactNode } from "react";

export interface PosSectionBannerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Light-grey section header used to separate logical groups of form fields
 * (e.g. "Thông tin cơ bản", "Thông tin thẻ thành viên", "Thông tin công ty").
 */
export function PosSectionBanner({
  children,
  className,
}: PosSectionBannerProps) {
  return (
    <div
      className={cn(
        "my-2 rounded-sm bg-[#EEF2F6] px-4 py-2 text-sm font-semibold text-gray-900",
        className,
      )}
    >
      {children}
    </div>
  );
}
