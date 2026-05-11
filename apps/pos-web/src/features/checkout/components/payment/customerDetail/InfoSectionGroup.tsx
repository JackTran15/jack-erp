import type { ReactNode } from "react";
import { cn } from "@erp/ui";

export interface InfoRow {
  label: string;
  value?: ReactNode;
}

export interface InfoSectionGroupProps {
  /** Section header text rendered in a gray bar (spec 4.7). */
  title: string;
  rows: InfoRow[];
  /** Placeholder for missing values (default: "Chưa có thông tin"). */
  emptyPlaceholder?: string;
}

/** Truthy when the row should render its raw value (vs. the muted placeholder). */
function hasValue(value: ReactNode): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Reusable two-column key/value group used in the "Thông tin" tab.
 * Header bar (gray) + grid of label/value rows. Missing values render as
 * muted gray placeholder text per spec 4.7.10.
 */
export function InfoSectionGroup({
  title,
  rows,
  emptyPlaceholder = "Chưa có thông tin",
}: InfoSectionGroupProps) {
  return (
    <section className="border border-gray-200">
      <header className="bg-[#F3F4F6] px-4 py-2.5">
        <h3 className="text-[14px] font-semibold text-gray-900">{title}</h3>
      </header>
      <div className="grid grid-cols-2">
        {rows.map((row, idx) => (
          <div
            key={`${row.label}-${idx}`}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-[14px]",
              // Bottom border on every row except the last 1–2 (depends on parity).
              idx < rows.length - (rows.length % 2 === 0 ? 2 : 1) &&
                "border-b border-gray-200",
            )}
          >
            <span className="min-w-[140px] text-gray-500">{row.label}</span>
            {hasValue(row.value) ? (
              <span className="font-semibold text-gray-900">{row.value}</span>
            ) : (
              <span className="text-gray-400">{emptyPlaceholder}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
