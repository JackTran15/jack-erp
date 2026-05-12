import { cn } from "@erp/ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";
import { useListKeyboardNavigation } from "@erp/pos/hooks/useListKeyboardNavigation";

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
  className,
  menuClassName,
  triggerClassName,
}: PosSelectProps<TValue>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const reactId = useId();
  const listboxId = `${reactId}-listbox`;

  // On open, set initial highlight to the index of the currently selected option (if any).
  // The hook auto-clamps to the nearest enabled item if the index falls on a disabled one.
  const initialIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.value === value);
    return idx >= 0 ? idx : 0;
  }, [options, value]);

  const selectByIndex = useCallback(
    (option: PosSelectOption<TValue>) => {
      onChange(option.value);
      setOpen(false);
    },
    [onChange],
  );

  const isOptionDisabled = useCallback(
    (option: PosSelectOption<TValue>) => Boolean(option.disabled),
    [],
  );

  const { highlightIdx, setHighlightIdx, handleKeyDown } =
    useListKeyboardNavigation<PosSelectOption<TValue>>({
      items: options,
      open,
      isDisabled: isOptionDisabled,
      initialIndex,
      onSelect: selectByIndex,
      onEscape: () => setOpen(false),
    });

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
    // Document-level keydown defensive — focus may not be on the trigger after
    // a click (some browsers blur after opening a portal). The hook ignores
    // unrelated keys; only ArrowUp/Down/Enter/Escape call `preventDefault`.
    const onDocKeyDown = (e: KeyboardEvent) => {
      // Tab / Shift+Tab → user leaves focus → close menu without preventDefault
      // so focus moves normally to the next element.
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      // Ignore if the user is typing in another input (e.g. a search field).
      const target = e.target as HTMLElement | null;
      const inOtherInput =
        target &&
        target !== triggerRef.current &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inOtherInput) return;
      handleKeyDown(e);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open, handleKeyDown]);

  // When highlightIdx changes, scroll the option into view (nearest — only
  // scrolls if actually needed). Skip when -1 (closed).
  useEffect(() => {
    if (!open || highlightIdx < 0) return;
    const el = optionRefs.current[highlightIdx];
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
  }, [open, highlightIdx]);

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      // ArrowDown/ArrowUp/Enter on the trigger when closed → open menu.
      // Escape when closed → do nothing.
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    handleKeyDown(e);
  };

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
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          triggerClass,
          "relative focus:outline-none",
          triggerClassName,
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && highlightIdx >= 0
            ? `${listboxId}-option-${highlightIdx}`
            : undefined
        }
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
              id={listboxId}
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
                options.map((option, idx) => {
                  const isSelected = option.value === value;
                  const isHighlighted = idx === highlightIdx;
                  const isDisabled = Boolean(option.disabled);
                  return (
                    <button
                      key={option.value}
                      ref={(el) => {
                        optionRefs.current[idx] = el;
                      }}
                      id={`${listboxId}-option-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isDisabled || undefined}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        onChange(option.value);
                        setOpen(false);
                      }}
                      onMouseEnter={() => {
                        if (!isDisabled) setHighlightIdx(idx);
                      }}
                      className={cn(
                        "block w-full px-4 py-2 text-left text-sm transition-colors",
                        isDisabled
                          ? "cursor-not-allowed text-gray-400"
                          : "text-gray-900",
                        !isDisabled && isHighlighted && "bg-indigo-50",
                        !isDisabled &&
                          isSelected &&
                          !isHighlighted &&
                          "bg-[#F8FAFF] text-[#4F46E5]",
                        !isDisabled &&
                          !isSelected &&
                          !isHighlighted &&
                          "hover:bg-[#F8FAFC]",
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
