import { cn } from "@erp/ui";
import type { ReactElement, ReactNode } from "react";
import type { IconProps } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface SectionCardProps {
  title: string;
  icon?: (props: IconProps) => ReactElement;
  className?: string;
  /** Optional trailing content on the header row (e.g. a computed total value). */
  headerRight?: ReactNode;
  children: ReactNode;
}

/** Card chrome shared by the "Tổng hợp" panels: icon + title header bar, white body. */
export function SectionCard({
  title,
  icon: Icon,
  className,
  headerRight,
  children,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-[#E5E7EB] bg-white",
        className,
      )}
    >
      <header className="flex items-center gap-2.5 border-b border-[#E5E7EB] bg-[#f1f3f8] px-5 py-4">
        {Icon ? <Icon size={18} className="text-[#6366F1]" /> : null}
        <h3 className="text-[16px] font-semibold uppercase tracking-wide text-[#1F2233]">
          {title}
        </h3>
        {headerRight ? <div className="ml-auto">{headerRight}</div> : null}
      </header>
      <div className="space-y-2 p-5 text-[14px]">{children}</div>
    </section>
  );
}
