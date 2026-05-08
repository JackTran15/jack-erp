import { cn } from "@erp/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";

export interface PosSelectOption<TValue extends string> {
  value: TValue;
  label: string;
  selectedDisplay?: string;
}

export interface PosSelectProps<TValue extends string> {
  value: TValue;
  onChange: (next: TValue) => void;
  options: ReadonlyArray<PosSelectOption<TValue>>;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  emptyText?: string;
  variant?: "boxed" | "underline";
  showChevron?: boolean;
  className?: string;
  menuClassName?: string;
  triggerClassName?: string;
}

export function PosSelect<TValue extends string>({
  value,
  onChange,
  options,
  id,
  ariaLabel,
  placeholder,
  emptyText = "Không có kết quả",
  variant = "boxed",
  showChevron = true,
  className,
  menuClassName,
  triggerClassName,
}: PosSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideTrigger = rootRef.current?.contains(target) ?? false;
      const clickedInsideMenu = menuRef.current?.contains(target) ?? false;
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const triggerClass =
    variant === "underline"
      ? cn(
          "h-8 w-full border-b border-transparent bg-transparent pb-2 pl-0 pt-1 text-left text-[14px] text-gray-900 shadow-[inset_0_-1px_0_0_#E5E7EB] transition-[box-shadow,color] duration-150 ease-out",
          showChevron && "pr-6",
          open
            ? "shadow-[inset_0_-2px_0_0_#5B5BD6]"
            : "focus:shadow-[inset_0_-2px_0_0_#5B5BD6]",
          !selected && "text-[#9CA3AF]",
        )
      : cn(
          "h-7 w-full rounded border border-gray-200 bg-white px-2 text-left text-[13px] transition-[border-color,box-shadow] duration-150 ease-out",
          showChevron && "pr-7",
          open
            ? "ring-2 ring-[#5C6BC0]/30"
            : "focus:ring-2 focus:ring-[#5C6BC0]/30",
        );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          triggerClass,
          "relative focus:outline-none",
          triggerClassName,
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="block truncate">
          {selected?.selectedDisplay ?? selected?.label ?? placeholder ?? ""}
        </span>
        {showChevron ? (
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#6B7280] transition-transform",
              open && "rotate-180",
            )}
          >
            <ChevronDownIcon size={14} />
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              className={cn(
                "fixed pointer-events-auto z-[100] max-h-72 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-lg transition-opacity delay-50 duration-75",
                menuClassName,
              )}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                opacity:
                  menuPosition.top === 0 && menuPosition.left === 0 ? 0 : 1,
              }}
            >
              {options.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">
                  {emptyText}
                </div>
              ) : (
                options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "block w-full px-4 py-2 text-left text-sm text-gray-900 transition-colors",
                        isSelected
                          ? "bg-[#F8FAFF] text-[#4F46E5]"
                          : "hover:bg-[#F8FAFC]",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
