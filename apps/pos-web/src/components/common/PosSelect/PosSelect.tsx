import { cn } from "@erp/ui";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  posFormFieldClass,
  posFormHeight,
  posFormPadX,
  posFormRadius,
  posFormRowClass,
  posFormUnderlineShadow,
  type PosFormSize,
} from "@erp/pos/components/common/posFormDimensions";

export type PosSelectSize = PosFormSize;

/** @deprecated Use {@link PosSelectSize} */
export type PosSelectBoxedSize = PosSelectSize;

export type PosSelectVariant = "boxed" | "underline";

const selectVariant: Record<
  PosSelectVariant,
  (size: PosSelectSize, open: boolean, invalid?: boolean) => string
> = {
  boxed: (size, open, invalid) =>
    cn(
      posFormRowClass,
      "border bg-white text-gray-700 transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[#5C6BC0]",
      posFormHeight[size],
      posFormRadius[size],
      invalid ? "border-[#F87171]" : "border-gray-200",
      open && !invalid && "ring-2 ring-[#5C6BC0]/30",
    ),
  underline: (size, open, invalid) =>
    cn(
      posFormRowClass,
      "border-b border-transparent bg-transparent text-gray-900 transition-[box-shadow] duration-150 ease-out",
      posFormHeight[size],
      posFormUnderlineShadow(invalid, open),
    ),
};

const selectTrigger = cn(posFormFieldClass, "truncate text-left");

/**
 * The data-bound subset of {@link PosSelectProps}. Wrapper components can use
 * this to accept a caller's typed data + handlers while owning presentation
 * (variant, placeholder, icons, sizing). Mirrors `PosSelectSearchConfig<T>`.
 */
export interface PosSelectConfig<T> {
  value?: T | null;
  onChange: (item: T) => void;
  items: ReadonlyArray<T>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  renderSelected?: (item: T) => ReactNode;
  isItemDisabled?: (item: T) => boolean;
  /** Forwarded to the underlying trigger button — used by hotkeys/focus. */
  triggerRef?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  /** Boxed row height only; ignored for `underline`. */
  size?: PosSelectSize;
}

export interface PosSelectProps<T> {
  /** Currently selected item, or null/undefined when nothing is picked. */
  value?: T | null;
  /** Called when an item is picked from the menu. */
  onChange: (item: T) => void;
  /** The full list of options. */
  items: ReadonlyArray<T>;

  /** Stable, unique key per item. */
  itemKey: (item: T) => string;
  /** Render the primary line of an option inside the dropdown. */
  renderItem: (item: T) => ReactNode;
  /** Optional secondary line shown under the primary line in the dropdown. */
  renderMeta?: (item: T) => ReactNode;
  /**
   * Content shown inside the trigger when an item is selected. Defaults to
   * `renderItem` — override when the trigger needs a more compact display
   * (e.g. an operator symbol while the menu shows the full label).
   */
  renderSelected?: (item: T) => ReactNode;
  /** Per-item disabled predicate. */
  isItemDisabled?: (item: T) => boolean;

  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  emptyText?: string;
  variant?: PosSelectVariant;
  position?: "top" | "bottom";
  showChevron?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  prefix?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  menuClassName?: string;
  triggerClassName?: string;
  /** Forwarded to the underlying trigger button — used by hotkeys/focus. */
  ref?: Ref<HTMLButtonElement>;
  /** Boxed control height (`sm` … `xl`); default `md`. No effect on `underline`. */
  size?: PosSelectSize;
}

/**
 * Generic single-select dropdown for static option lists. Pair with
 * {@link PosSelectSearch} when the picker needs type-to-filter — the two
 * components share the same generic shape (`items`/`value`/`onChange` +
 * `itemKey`/`renderItem`/`renderSelected`/`renderMeta`) so consumers can swap
 * one for the other with minimal API churn.
 *
 * Behavior:
 *  - Trigger is a button. Click toggles the floating menu (portal'd to body).
 *  - Keyboard nav on the focused trigger:
 *      ArrowDown / ArrowUp — open with highlight, or move highlight.
 *      Home / End          — jump to first/last enabled item (open only).
 *      Enter / Space       — open menu, or commit highlighted item.
 *      Escape / Tab        — close menu.
 *  - Selecting an item commits and closes; click-outside also closes.
 *  - `position="top"` flips the menu above the trigger (useful in footers).
 */
export function PosSelect<T>({
  value,
  onChange,
  items,
  itemKey,
  renderItem,
  renderMeta,
  renderSelected,
  isItemDisabled,
  id,
  ariaLabel,
  placeholder,
  emptyText = "Không có kết quả",
  variant = "boxed",
  position = "bottom",
  showChevron = true,
  invalid,
  disabled,
  prefix,
  trailing,
  className,
  menuClassName,
  triggerClassName,
  ref,
  size = "md",
}: PosSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (!ref) return;
    if (typeof ref === "function") ref(node);
    else (ref as { current: HTMLButtonElement | null }).current = node;
  };

  const selectedKey = value != null ? itemKey(value) : null;
  const isEmptySelection = value == null;
  const selectedDisplay = useMemo<ReactNode>(() => {
    if (isEmptySelection) {
      // Keep a line box when placeholder is omitted/empty so the trigger stays clickable.
      return placeholder?.trim() ? placeholder : "\u00a0";
    }
    return (renderSelected ?? renderItem)(value);
  }, [value, placeholder, renderItem, renderSelected, isEmptySelection]);

  const isDisabledAt = (idx: number) =>
    idx < 0 || idx >= items.length || (isItemDisabled?.(items[idx]) ?? false);

  /**
   * Walk `items` from `start` in `dir` and return the first enabled index.
   * Wraps around at the ends; returns -1 when every item is disabled.
   */
  const findEnabledIndex = (start: number, dir: 1 | -1): number => {
    if (items.length === 0) return -1;
    let idx = start;
    for (let i = 0; i < items.length; i++) {
      idx = (idx + dir + items.length) % items.length;
      if (!isDisabledAt(idx)) return idx;
    }
    return -1;
  };

  const firstEnabledIndex = () => findEnabledIndex(-1, 1);
  const lastEnabledIndex = () => findEnabledIndex(0, -1);

  /** Seed the highlight: current selection if enabled, else first enabled. */
  const initialHighlight = (): number => {
    if (selectedKey != null) {
      const idx = items.findIndex((item) => itemKey(item) === selectedKey);
      if (idx >= 0 && !isDisabledAt(idx)) return idx;
    }
    return firstEnabledIndex();
  };

  const openMenu = () => {
    if (disabled || open) return;
    setHighlightIdx(initialHighlight());
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setHighlightIdx(-1);
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (open) closeMenu();
    else openMenu();
  };

  const commit = (item: T) => {
    onChange(item);
    closeMenu();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (e.key) {
      case "Escape":
        if (open) {
          e.preventDefault();
          closeMenu();
        }
        return;
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        setHighlightIdx((prev) => findEnabledIndex(prev, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        setHighlightIdx((prev) => findEnabledIndex(prev, -1));
        return;
      case "Home":
        if (!open) return;
        e.preventDefault();
        setHighlightIdx(firstEnabledIndex());
        return;
      case "End":
        if (!open) return;
        e.preventDefault();
        setHighlightIdx(lastEnabledIndex());
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) {
          openMenu();
          return;
        }
        if (highlightIdx >= 0 && !isDisabledAt(highlightIdx)) {
          commit(items[highlightIdx]);
        }
        return;
      case "Tab":
        if (open) closeMenu();
        return;
    }
  };

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (next instanceof Node) {
        if (menuRef.current?.contains(next)) return;
        if (root.contains(next)) return;
      }
      setOpen(false);
      setHighlightIdx(-1);
    };
    root.addEventListener("focusout", onFocusOut);
    return () => root.removeEventListener("focusout", onFocusOut);
  }, [open]);

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
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn(
        selectVariant[variant](size, open, invalid),
        posFormPadX[size],
        disabled && "cursor-not-allowed opacity-60 bg-gray-100",
        className,
      )}
    >
      {prefix ? (
        <span className="flex shrink-0 items-center text-gray-500">
          {prefix}
        </span>
      ) : null}
      <button
        ref={setTriggerRef}
        id={id}
        type="button"
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          selectTrigger,
          "self-stretch",
          isEmptySelection && "text-gray-400",
          triggerClassName,
        )}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
      >
        {selectedDisplay}
      </button>

      {trailing}

      {showChevron ? (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggleOpen}
          className={cn(
            "flex shrink-0 items-center text-gray-400 transition-transform focus:outline-none",
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
              {items.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">
                  {emptyText}
                </div>
              ) : (
                items.map((item, i) => {
                  const key = itemKey(item);
                  const isSelected = key === selectedKey;
                  const itemDisabled = isItemDisabled?.(item) ?? false;
                  const isHighlighted = i === highlightIdx;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={itemDisabled}
                      onMouseEnter={() => {
                        if (!itemDisabled) setHighlightIdx(i);
                      }}
                      onMouseDown={(e) => {
                        // Keep focus on the trigger so the parent's keyboard
                        // flow isn't interrupted between mousedown and click.
                        e.preventDefault();
                      }}
                      onClick={() => {
                        if (!itemDisabled) commit(item);
                      }}
                      className={cn(
                        "block w-full px-4 py-2 text-left text-sm text-gray-900 transition-colors",
                        itemDisabled
                          ? "cursor-not-allowed text-gray-400"
                          : isSelected
                            ? "bg-indigo-100 text-[#4F46E5]"
                            : isHighlighted
                              ? "bg-indigo-50"
                              : "hover:bg-indigo-50",
                      )}
                    >
                      <div>{renderItem(item)}</div>
                      {renderMeta ? (
                        <div className="text-[12px] text-gray-500">
                          {renderMeta(item)}
                        </div>
                      ) : null}
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
