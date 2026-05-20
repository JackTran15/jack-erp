import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@erp/ui";
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

export interface SearchSuggestion<T> {
  item: T;
  disabled?: boolean;
}

export type PosSearchPopoverVariant = "boxed" | "underline";

/**
 * Preset chrome (border/height) for `variant` mode — mirrors the look the former
 * `PosSelectSearch` rendered, so picker call sites stay concise. Consumers that
 * leave `variant` unset keep full control via `containerClassName`/`prefix`.
 */
const searchPopoverVariant: Record<
  PosSearchPopoverVariant,
  (size: PosFormSize, open: boolean) => string
> = {
  boxed: (size, open) =>
    cn(
      posFormRowClass,
      "border border-gray-200 bg-white text-gray-700 transition-[border-color,box-shadow] duration-150 ease-out hover:border-gray-300 focus-within:border-[#5C6BC0]",
      posFormHeight[size],
      posFormRadius[size],
      open && "ring-2 ring-[#5C6BC0]/30",
    ),
  underline: (size, open) =>
    cn(
      posFormRowClass,
      "border-b border-transparent bg-transparent transition-[box-shadow] duration-150 ease-out",
      posFormUnderlineShadow(false, open),
      posFormHeight[size],
    ),
};

export interface PosSearchPopoverProps<T> {
  value: string;
  onValueChange: (value: string) => void;

  /** Async search — returns the suggestion list for the current query. */
  search: (query: string) => Promise<SearchSuggestion<T>[]>;
  /** Called when a suggestion is picked (mouse / Enter on highlight). */
  onSelect: (item: T) => void;

  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;

  /** Enter pressed without highlight. Return `true` to suppress default. */
  onSubmitQuery?: (query: string) => boolean | void;

  placeholder?: string;
  inputType?: string;
  ariaLabel?: string;
  disabled?: boolean;

  /**
   * Preset chrome. When set, the component draws its own border/height (+ a
   * trailing chevron) so picker call sites don't supply `containerClassName`.
   * Leave unset to keep full control via `containerClassName`/`prefix`/`suffix`.
   */
  variant?: PosSearchPopoverVariant;
  /** Control height for the preset chrome (default `"md"`). */
  size?: PosFormSize;
  /** Leading icon rendered inside the preset chrome, before the input. */
  leadingIcon?: ReactNode;
  /** Shortcut hint prefixed into the placeholder, e.g. `"Alt + N"`. */
  shortcut?: string;

  minChars?: number;
  debounceMs?: number;
  maxSuggestions?: number;

  /** Extra slots — rendered before/after the input inside the wrapper. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Class for the bordered wrapper that holds prefix/input/suffix. */
  containerClassName?: string;
  /** Class for the bare <input>. */
  inputClassName?: string;

  inputRef?: Ref<HTMLInputElement>;

  /** Optional empty-state action shown when search returns nothing. */
  emptyAction?: { label: string; onClick: (currentQuery: string) => void };
}

/**
 * Reusable input + suggestion popover. Owns debounce, keyboard navigation,
 * click-outside dismissal, and ARIA wiring. Visual layout (icons, borders)
 * is delegated to the consumer via `prefix` / `suffix` / `containerClassName`.
 */
export function PosSearchPopover<T>({
  value,
  onValueChange,
  search,
  onSelect,
  itemKey,
  renderItem,
  renderMeta,
  onSubmitQuery,
  placeholder,
  inputType = "search",
  ariaLabel,
  disabled,
  variant,
  size = "md",
  leadingIcon,
  shortcut,
  minChars = 2,
  debounceMs = 300,
  maxSuggestions = 8,
  prefix,
  suffix,
  containerClassName,
  inputClassName,
  inputRef,
  emptyAction,
}: PosSearchPopoverProps<T>) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<SearchSuggestion<T>[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);

  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      internalInputRef.current = node;
      if (!inputRef) return;
      if (typeof inputRef === "function") inputRef(node);
      else (inputRef as { current: HTMLInputElement | null }).current = node;
    },
    [inputRef],
  );

  const runSearch = useCallback(
    async (q: string) => {
      if (q.length < minChars) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const results = await search(q);
        setSuggestions(results.slice(0, maxSuggestions));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [search, minChars, maxSuggestions],
  );

  const handleChange = useCallback(
    (val: string) => {
      onValueChange(val);
      setHighlightIdx(-1);
      setOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = val.trim();
      if (q.length < minChars) {
        setSuggestions([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(q);
      }, debounceMs);
    },
    [onValueChange, runSearch, minChars, debounceMs],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectItem = useCallback(
    (item: T) => {
      onSelect(item);
      setOpen(false);
      setSuggestions([]);
      setHighlightIdx(-1);
    },
    [onSelect],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter" && onSubmitQuery) {
        const handled = onSubmitQuery(value.trim());
        if (handled) e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
          const sg = suggestions[highlightIdx]!;
          if (!sg.disabled) selectItem(sg.item);
        } else if (onSubmitQuery) {
          onSubmitQuery(value.trim());
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const trimmed = value.trim();
  const showDropdown = open && trimmed.length >= minChars;
  const hasSuggestions = suggestions.length > 0;

  // Preset chrome (variant) vs fully consumer-driven layout (default).
  const preset = variant !== undefined;
  const resolvedContainerClass = preset
    ? cn(
        searchPopoverVariant[variant](size, open),
        posFormPadX[size],
        disabled && "cursor-not-allowed opacity-60",
        containerClassName,
      )
    : containerClassName;
  const resolvedInputClass = preset
    ? cn(
        posFormFieldClass,
        "placeholder:italic placeholder:text-gray-400",
        inputClassName,
      )
    : inputClassName;
  const resolvedPrefix = preset
    ? leadingIcon
      ? (
          <span className="flex shrink-0 items-center text-gray-500">
            {leadingIcon}
          </span>
        )
      : prefix
    : prefix;
  const resolvedSuffix = preset
    ? (suffix ?? (
        <span className="flex shrink-0 items-center text-gray-400">
          <ChevronDownIcon
            size={14}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      ))
    : suffix;
  const resolvedPlaceholder = shortcut
    ? `(${shortcut}) ${placeholder ?? ""}`
    : placeholder;

  return (
    <div ref={wrapRef} className="relative">
      <div className={resolvedContainerClass}>
        {resolvedPrefix}
        <input
          ref={setRefs}
          id={inputId}
          type={inputType}
          autoComplete="off"
          placeholder={resolvedPlaceholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (trimmed.length >= minChars && suggestions.length === 0) {
              void runSearch(trimmed);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={showDropdown && hasSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightIdx >= 0 ? `${listboxId}-${highlightIdx}` : undefined
          }
          className={resolvedInputClass}
        />
        {resolvedSuffix}
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[13px] text-gray-500">Đang tìm…</div>
          ) : hasSuggestions ? (
            <ul role="listbox" id={listboxId} className="py-1">
              {suggestions.map((sg, i) => {
                const key = itemKey(sg.item);
                const active = i === highlightIdx;
                return (
                  <li
                    key={key}
                    id={`${listboxId}-${i}`}
                    role="option"
                    aria-selected={active}
                    aria-disabled={sg.disabled || undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!sg.disabled) selectItem(sg.item);
                    }}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={cn(
                      "cursor-pointer px-3 py-2 text-[13px]",
                      active ? "bg-indigo-50" : "bg-white",
                      sg.disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="text-gray-900">{renderItem(sg.item)}</div>
                    {renderMeta ? (
                      <div className="text-[12px] text-gray-500">
                        {renderMeta(sg.item)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] text-gray-500">
              <span>Không có kết quả.</span>
              {emptyAction ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    emptyAction.onClick(trimmed);
                    setOpen(false);
                  }}
                  className="text-indigo-600 hover:text-indigo-700"
                >
                  {emptyAction.label}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
