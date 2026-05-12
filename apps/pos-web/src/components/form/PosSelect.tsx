import { cn } from "@erp/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";

export interface PosSelectOption<TValue extends string> {
  value: TValue;
  label: string;
  selectedDisplay?: string;
  disabled?: boolean;
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
  position?: "top" | "bottom";
  showChevron?: boolean;
  invalid?: boolean;
  trailing?: ReactNode;
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
  position = "bottom",
  showChevron = true,
  invalid,
  trailing,
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
      const rect = rootRef.current?.getBoundingClientRect();
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

  const wrapperClass =
    variant === "underline"
      ? cn(
          "flex h-8 items-center gap-2 border-b border-transparent bg-transparent transition-[box-shadow] duration-150 ease-out",
          invalid
            ? "shadow-[inset_0_-2px_0_0_#F87171]"
            : open
              ? "shadow-[inset_0_-2px_0_0_#5B5BD6]"
              : "shadow-[inset_0_-1px_0_0_#E5E7EB] focus-within:shadow-[inset_0_-2px_0_0_#5B5BD6]",
        )
      : cn(
          "flex h-7 items-center gap-2 rounded border bg-white transition-[border-color,box-shadow] duration-150 ease-out",
          invalid
            ? "border-[#F87171]"
            : "border-gray-200 focus-within:border-[#5C6BC0]",
          open && !invalid && "ring-2 ring-[#5C6BC0]/30",
        );

  const triggerClass =
    variant === "underline"
      ? cn(
          "min-w-0 flex-1 bg-transparent pb-2 pl-0 pt-1 text-left text-[14px] text-gray-900 transition-colors",
          !selected && "text-[#9CA3AF]",
        )
      : cn("min-w-0 flex-1 bg-transparent px-2 text-left text-[13px]");

  const toggleOpen = () => setOpen((prev) => !prev);

  return (
    <div ref={rootRef} className={cn(wrapperClass, className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={toggleOpen}
        className={cn(triggerClass, "focus:outline-none", triggerClassName)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
      >
        <span className="block truncate">
          {selected?.selectedDisplay ?? selected?.label ?? placeholder ?? ""}
        </span>
      </button>

      {trailing}

      {showChevron ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggleOpen}
          className={cn(
            "shrink-0 pr-1 text-[#6B7280] transition-transform focus:outline-none",
            open && "rotate-180",
          )}
        >
          <ChevronDownIcon size={14} />
        </button>
      ) : null}

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
                ...(position === "top"
                  ? {
                      top:
                        menuPosition.top -
                        (menuRef.current?.clientHeight ?? 0) -
                        (triggerRef.current?.clientHeight ?? 0) -
                        8,
                    }
                  : {}),
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
                      disabled={option.disabled}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "block w-full px-4 py-2 text-left text-sm text-gray-900 transition-colors",
                        option.disabled
                          ? "cursor-not-allowed text-gray-400"
                          : isSelected
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
