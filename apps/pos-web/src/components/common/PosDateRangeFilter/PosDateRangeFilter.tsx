import { useEffect, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";
import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { DATE_RANGE_FILTER_CHOICES } from "@erp/pos/constants/common.constant";
import type { PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";

interface PosDateRangeFilterProps {
  value: PosDateRangeFilterOption;
  onChange: (next: PosDateRangeFilterOption) => void;
}

/**
 * Discrete date-range filter widget. Keeps a "pending" buffer so the user
 * can preview a choice before committing via "Áp dụng" — matches the
 * existing draft-invoices UX.
 */
export function PosDateRangeFilter({ value, onChange }: PosDateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PosDateRangeFilterOption>(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setPending(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel =
    DATE_RANGE_FILTER_CHOICES.find((c) => c.value === value)?.label ??
    "Toàn bộ";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Lọc theo khoảng thời gian"
        className={cn(
          "flex h-10 w-[280px] items-center justify-between rounded-lg border border-[#E1E3EA] bg-white px-4 text-[14px] font-medium text-[#1F2233] transition-colors",
          "hover:border-[#C7CAD3] hover:bg-[#FAFAFB]",
          "focus:border-[#6366F1] focus:outline-none focus:ring-[3px] focus:ring-[#6366F1]/15",
        )}
      >
        <span>{currentLabel}</span>
        <ChevronDownIcon
          size={16}
          strokeWidth={2}
          className={cn(
            "text-[#6366F1] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Khoảng thời gian"
          className={cn(
            "absolute left-0 z-[1100] mt-1 w-[280px] rounded-lg border border-[#E6E8EE] bg-white",
            "shadow-[0_8px_24px_rgba(15,20,36,0.12),0_2px_4px_rgba(15,20,36,0.06)]",
          )}
        >
          <div className="py-2">
            {DATE_RANGE_FILTER_CHOICES.map((choice) => {
              const selected = choice.value === pending;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setPending(choice.value)}
                  className={cn(
                    "flex w-full items-center gap-3 px-5 py-3 text-left text-[14px] transition-colors",
                    selected
                      ? "bg-[#EEEEFB] font-medium text-[#6366F1]"
                      : "text-[#1F2233] hover:bg-[#F4F5F7]",
                  )}
                >
                  <PosRadio selected={selected} />
                  {choice.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-6 border-t border-[#E6E8EE] px-5 py-3.5">
            <button
              type="button"
              onClick={() => {
                onChange(pending);
                setOpen(false);
              }}
              className="text-[14px] font-semibold text-[#6366F1] transition-colors hover:text-[#5457E0]"
            >
              Áp dụng
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[14px] font-medium text-[#4B5163] transition-colors hover:text-[#1F2233]"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
