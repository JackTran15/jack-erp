import type { ReactNode } from "react";

export interface CountBadgeProps {
  children: ReactNode;
}

/**
 * Tiny pill badge used to show counts (e.g. "2" next to "Tổng tiền").
 * Light gray bg + dark text, 12px semibold.
 */
export function CountBadge({ children }: CountBadgeProps) {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[12px] font-semibold leading-none text-gray-700">
      {children}
    </span>
  );
}
