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

  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);

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
    if (!open || suggestions.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Enter": {
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
          selectItem(suggestions[highlightIdx]!);
        }
        break;
      }
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const showDropdown = open && value.trim().length >= minChars;
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="relative" ref={wrapRef}>
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
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tìm…</div>
          ) : hasSuggestions ? (
            <ScrollArea className="max-h-60">
              <ul id={listboxId} role="listbox" className="py-1">
                {suggestions.map((item, idx) => (
                  <li
                    key={itemKey(item)}
                    id={`${listboxId}-${idx}`}
                    role="option"
                    aria-selected={idx === highlightIdx}
                    className={[
                      "cursor-pointer px-3 py-2 text-sm",
                      idx === highlightIdx ? "bg-muted" : "bg-background",
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
