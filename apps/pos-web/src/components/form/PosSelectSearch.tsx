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
import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";

export interface PosSelectSearchSuggestion<T> {
  item: T;
  disabled?: boolean;
}

/**
 * The data-bound subset of {@link PosSelectSearchProps}. Wrapper components
 * (e.g. POSToolbar, ProductCatalogHeader) use this to accept the caller's
 * typed data + handlers while owning the presentation (placeholder, shortcut,
 * leading icon, sizing).
 */
export interface PosSelectSearchConfig<T> {
  value?: T | null;
  onChange: (item: T) => void;
  search: (query: string) => ReadonlyArray<PosSelectSearchSuggestion<T>>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  renderSelected: (item: T) => string;
  /** Forwarded to the underlying input — used by hotkeys to focus the field. */
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

export interface PosSelectSearchProps<T> {
  /** Currently selected item, or null/undefined when nothing is picked. */
  value?: T | null;
  /** Called when an item is picked from the dropdown. */
  onChange: (item: T) => void;

  /**
   * Synchronous filter — given the current query, return the suggestions to
   * display. Callers own the filtering strategy (substring, fuzzy, async via
   * outer state, etc.).
   */
  search: (query: string) => ReadonlyArray<PosSelectSearchSuggestion<T>>;

  /** Stable, unique key per item. */
  itemKey: (item: T) => string;
  /** Render the primary line of an option inside the dropdown. */
  renderItem: (item: T) => ReactNode;
  /** Optional secondary line shown under the primary line. */
  renderMeta?: (item: T) => ReactNode;
  /** Plain text shown inside the input when an item is selected. */
  renderSelected: (item: T) => string;

  /** Shown in the input when nothing is selected. */
  placeholder: string;
  /** Inline shortcut hint, e.g. "Alt + N", prefixed to the placeholder. */
  shortcut?: string;
  /** Icon shown at the leading edge of the input. */
  leadingIcon?: ReactNode;
  emptyText?: string;

  disabled?: boolean;
  ariaLabel?: string;
  /** Applied to the outer wrapper. */
  className?: string;
  /** Applied to the floating menu. */
  menuClassName?: string;
  /** Position of the floating menu — "bottom" (default) or "top". */
  position?: "bottom" | "top";
  /** Forwarded to the underlying input — used by hotkeys to focus the field. */
  ref?: Ref<HTMLInputElement>;
}

/**
 * Generic combobox where the input is both the trigger and the search field.
 * Mirrors the {@link SearchSelectInput} pattern: callers provide a `search`
 * adapter plus `renderItem` / `renderMeta` / `renderSelected` / `itemKey` so
 * the menu can be populated with arbitrary item types.
 *
 * Behavior:
 *  - When closed and a value is set, the input shows `renderSelected(value)`.
 *  - Focus / click / ArrowDown / Enter opens the menu with an empty query.
 *  - Typing filters via `search(query)`. Arrow keys move highlight; Enter
 *    commits the highlighted (or first) suggestion.
 *  - Escape, click-outside, or picking an option closes the menu.
 */
export function PosSelectSearch<T>({
  value,
  onChange,
  search,
  itemKey,
  renderItem,
  renderMeta,
  renderSelected,
  placeholder,
  shortcut,
  leadingIcon,
  emptyText = "Không có kết quả",
  disabled,
  ariaLabel,
  className,
  menuClassName,
  position = "bottom",
  ref,
}: PosSelectSearchProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const setInputRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (!ref) return;
    if (typeof ref === "function") ref(node);
    else (ref as { current: HTMLInputElement | null }).current = node;
  };

  const suggestions = useMemo(() => search(query), [search, query]);
  const valueKey = value ? itemKey(value) : null;

  const openMenu = () => {
    if (open) return;
    setQuery("");
    setHighlightIdx(-1);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setQuery("");
    setHighlightIdx(-1);
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
      setQuery("");
      setHighlightIdx(-1);
    };
    root.addEventListener("focusout", onFocusOut);
    return () => root.removeEventListener("focusout", onFocusOut);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const insideRoot = rootRef.current?.contains(t) ?? false;
      const insideMenu = menuRef.current?.contains(t) ?? false;
      if (!insideRoot && !insideMenu) closeMenu();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const commit = (item: T) => {
    onChange(item);
    closeMenu();
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeMenu();
      }
      return;
    }
    if (e.key === "Tab" && open) {
      closeMenu();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        if (suggestions.length === 0) return;
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        if (suggestions.length === 0) return;
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Enter": {
        if (suggestions.length === 0) return;
        e.preventDefault();
        const idx = highlightIdx >= 0 ? highlightIdx : 0;
        const sg = suggestions[idx];
        if (sg && !sg.disabled) commit(sg.item);
        break;
      }
    }
  };

  const displayValue = open ? query : value ? renderSelected(value) : "";
  const fullPlaceholder = shortcut
    ? `(${shortcut}) ${placeholder}`
    : placeholder;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative inline-flex h-9 items-center gap-1 rounded-md border border-gray-200 bg-white text-gray-700 transition-colors hover:border-gray-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {leadingIcon ? (
        <span className="flex shrink-0 items-center pl-2.5 pr-1 text-gray-500">
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={setInputRef}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={fullPlaceholder}
        onFocus={openMenu}
        onMouseDown={() => {
          if (!open) openMenu();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlightIdx(-1);
          if (!open) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 placeholder:italic placeholder:text-gray-400 focus:outline-none",
          leadingIcon ? "px-1" : "pl-2.5 pr-1",
        )}
      />
      <span className="flex shrink-0 items-center pr-2 text-gray-400">
        <ChevronDownIcon
          size={14}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </span>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label={ariaLabel}
              className={cn(
                "fixed pointer-events-auto z-[100] max-h-80 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg",
                menuClassName,
              )}
              style={{
                top: menuPos.top + 4,
                left: menuPos.left,
                minWidth: menuPos.width,
                ...(position === "top"
                  ? {
                      top:
                        menuPos.top -
                        (menuRef.current?.clientHeight ?? 0) -
                        (rootRef.current?.clientHeight ?? 0) -
                        8,
                    }
                  : {}),
              }}
            >
              {suggestions.length === 0 ? (
                <div className="px-3 py-2 text-[13px] text-gray-500">
                  {emptyText}
                </div>
              ) : (
                suggestions.map((sg, i) => {
                  const key = itemKey(sg.item);
                  const isSelected = valueKey !== null && key === valueKey;
                  const isHighlighted = i === highlightIdx;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={sg.disabled}
                      onMouseEnter={() => setHighlightIdx(i)}
                      onMouseDown={(e) => {
                        // Keep focus inside the input so blur doesn't fire first.
                        e.preventDefault();
                      }}
                      onClick={() => {
                        if (!sg.disabled) commit(sg.item);
                      }}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm text-gray-900 transition-colors",
                        sg.disabled
                          ? "cursor-not-allowed text-gray-400"
                          : isSelected
                            ? "bg-indigo-100 text-indigo-700"
                            : isHighlighted
                              ? "bg-indigo-50 "
                              : " hover:bg-indigo-50",
                      )}
                    >
                      <div>{renderItem(sg.item)}</div>
                      {renderMeta ? (
                        <div className="text-[12px] text-gray-500">
                          {renderMeta(sg.item)}
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
