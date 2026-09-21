import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { Input, ScrollArea } from "@erp/ui";

export interface SearchListingInputProps<T> {
  inputId?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (item: T) => void;
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  label?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  debounceMs?: number;
  minChars?: number;
  maxSuggestions?: number;
}

export function SearchListingInput<T>({
  inputId,
  value,
  onValueChange,
  onSelect,
  search,
  itemKey,
  renderItem,
  renderMeta,
  label,
  placeholder,
  hint,
  required,
  disabled,
  debounceMs = 300,
  minChars = 2,
  maxSuggestions = 8,
}: SearchListingInputProps<T>) {
  const fallbackId = useId();
  const resolvedId = inputId ?? fallbackId;
  const listboxId = `${resolvedId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic counter: a slow response for an older query must never overwrite
  // a newer one, or the auto-highlighted first row would point at stale data.
  const searchSeqRef = useRef(0);
  // True between a keystroke and that query's results landing.
  const staleRef = useRef(false);
  const isComposingRef = useRef(false);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(
    async (q: string): Promise<T[] | null> => {
      if (q.length < minChars) {
        setSuggestions([]);
        setHighlightIdx(-1);
        staleRef.current = false;
        return [];
      }
      const seq = ++searchSeqRef.current;
      setLoading(true);
      try {
        const results = await search(q);
        if (seq !== searchSeqRef.current) return null;
        const items = results.slice(0, maxSuggestions);
        setSuggestions(items);
        // Results are current: highlight row 0 so Enter picks it directly.
        setHighlightIdx(items.length > 0 ? 0 : -1);
        staleRef.current = false;
        return items;
      } catch {
        if (seq !== searchSeqRef.current) return null;
        setSuggestions([]);
        setHighlightIdx(-1);
        staleRef.current = false;
        return [];
      } finally {
        if (seq === searchSeqRef.current) setLoading(false);
      }
    },
    [search, minChars, maxSuggestions],
  );

  const handleChange = useCallback(
    (val: string) => {
      onValueChange(val);
      // Visible rows still belong to the previous query — drop the highlight
      // until fresh results land so Enter can't pick a stale one.
      setHighlightIdx(-1);
      staleRef.current = true;
      setOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = val.trim();
      if (q.length < minChars) {
        setSuggestions([]);
        staleRef.current = false;
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
      staleRef.current = false;
    },
    [onSelect],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Handled before the empty-list guard below, otherwise Escape is swallowed
    // while "Không tìm thấy" is showing. stopPropagation keeps it from reaching
    // an enclosing dialog, which would close the whole form.
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setOpen(false);
      setHighlightIdx(-1);
      return;
    }
    if (!open) return;

    if (e.key === "Enter") {
      // Vietnamese IME: this Enter confirms the composition, not a selection.
      if (isComposingRef.current || e.nativeEvent.isComposing) return;
      e.preventDefault();

      // Enter before the debounce fired: the visible list is the previous
      // query's. Run the new query now and take its first row instead.
      if (staleRef.current || loading) {
        const q = value.trim();
        if (q.length < minChars) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runSearch(q).then((items) => {
          if (items && items.length > 0) selectItem(items[0]!);
        });
        return;
      }

      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        selectItem(suggestions[highlightIdx]!);
      }
      return;
    }

    if (suggestions.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setHighlightIdx(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightIdx(suggestions.length - 1);
        break;
    }
  };

  // Keep the highlighted row visible while arrowing.
  useEffect(() => {
    if (!open || highlightIdx < 0) return;
    optionRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open, suggestions]);

  const showDropdown = open && value.trim().length >= minChars;
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="relative" ref={wrapRef} data-dropdown-open={open ? "true" : undefined}>
      {label && (
          <label htmlFor={resolvedId} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
      )}
      <Input
        id={resolvedId}
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          setOpen(true);
          if (value.trim().length >= minChars && suggestions.length === 0) {
            void runSearch(value.trim());
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        role="combobox"
        aria-expanded={showDropdown && hasSuggestions}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          highlightIdx >= 0 ? `${listboxId}-${highlightIdx}` : undefined
        }
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      {showDropdown ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tìm…</div>
          ) : hasSuggestions ? (
            <ScrollArea className="max-h-60">
              <ul id={listboxId} role="listbox" className="py-1">
                {suggestions.map((item, idx) => (
                  <li
                    key={itemKey(item)}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    id={`${listboxId}-${idx}`}
                    role="option"
                    aria-selected={idx === highlightIdx}
                    className={[
                      "cursor-pointer px-3 py-2 text-sm",
                      idx === highlightIdx
                        ? "bg-accent font-medium text-accent-foreground shadow-[inset_3px_0_0_0_hsl(var(--ring))]"
                        : "bg-popover hover:bg-muted/60",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectItem(item);
                    }}
                    onMouseEnter={() => setHighlightIdx(idx)}
                  >
                    <div className="font-medium">{renderItem(item)}</div>
                    {renderMeta ? (
                      <div className="text-xs text-muted-foreground">{renderMeta(item)}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Không tìm thấy.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
