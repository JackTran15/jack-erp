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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchSelectSuggestion<T> {
  item: T;
  disabled?: boolean;
}

export interface SearchSelectInputProps<T> {
  /** Current text value of the input. */
  value: string;
  onValueChange: (value: string) => void;

  /** Called when an item is picked (from suggestions or modal). */
  onSelect: (item: T) => void;

  /** Async search function — returns suggestions for the given query. */
  search: (query: string) => Promise<SearchSelectSuggestion<T>[]>;

  /** Unique key extractor for each suggestion item. */
  itemKey: (item: T) => string;

  /** Render the primary line of a suggestion row. */
  renderItem: (item: T) => ReactNode;

  /** Render secondary/meta text under the primary line (optional). */
  renderMeta?: (item: T) => ReactNode;

  /** Placeholder for the search input. */
  placeholder?: string;

  /** Input type (default "text"). */
  inputType?: string;

  /** Input inputMode (default undefined). */
  inputMode?: "text" | "numeric" | "tel" | "search" | "none";

  /** Debounce delay in ms (default 300). */
  debounceMs?: number;

  /** Minimum characters before searching (default 2). */
  minChars?: number;

  /** Max suggestions shown (default 8). */
  maxSuggestions?: number;

  /** Label text above the input (optional). */
  label?: string;

  /** Hint text below the input (optional). */
  hint?: string;

  /** Disable the input. */
  disabled?: boolean;

  /** aria-label for the input (optional, label is preferred). */
  ariaLabel?: string;

  /** Ref tới ô input (vd. focus bằng phím tắt POS). */
  inputRef?: Ref<HTMLInputElement>;

  // ---- Action buttons (optional) ----

  /** Config for a "create new" action button + modal. */
  createAction?: {
    label: string;
    /** Called when the user clicks the create button. Receives current query. */
    onTrigger: (currentQuery: string) => void;
  };

  /** Config for an "advanced search / listing" action button + modal. */
  listAction?: {
    label: string;
    onTrigger: () => void;
  };

  /** Called when the user presses Enter and no suggestion is highlighted.
   *  Receives current query. Return true to prevent default form submit. */
  onSubmitQuery?: (query: string) => boolean | void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchSelectInput<T>({
  value,
  onValueChange,
  onSelect,
  search,
  itemKey,
  renderItem,
  renderMeta,
  placeholder,
  inputType = "text",
  inputMode,
  debounceMs = 300,
  minChars = 2,
  maxSuggestions = 8,
  label,
  hint,
  disabled,
  ariaLabel,
  inputRef: externalInputRef,
  createAction,
  listAction,
  onSubmitQuery,
}: SearchSelectInputProps<T>) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setInputRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (!externalInputRef) return;
      if (typeof externalInputRef === "function") {
        externalInputRef(node);
      } else {
        externalInputRef.current = node;
      }
    },
    [externalInputRef],
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<SearchSelectSuggestion<T>[]>(
    [],
  );
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);

  // Debounced search
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

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Click outside → close
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

  const showDropdown = open && value.trim().length >= minChars;
  const hasSuggestions = suggestions.length > 0;

  return (
    <div className="pos-ss" ref={wrapRef}>
      {label && (
        <label htmlFor={inputId} className="pos-ss__label">
          {label}
        </label>
      )}

      <div className="pos-ss__row">
        <input
          ref={setInputRefs}
          id={inputId}
          className="pos-input pos-ss__input"
          type={inputType}
          inputMode={inputMode}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            setOpen(true);
            if (value.trim().length >= minChars && suggestions.length === 0) {
              void runSearch(value.trim());
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          role="combobox"
          aria-expanded={showDropdown && hasSuggestions}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            highlightIdx >= 0 ? `${listboxId}-${highlightIdx}` : undefined
          }
          aria-label={ariaLabel}
        />

        {createAction && (
          <button
            type="button"
            className="pos-btn pos-btn--secondary pos-btn--sm"
            onClick={() => createAction.onTrigger(value.trim())}
            aria-label={createAction.label}
            title={createAction.label}
          >
            +
          </button>
        )}

        {listAction && (
          <button
            type="button"
            className="pos-btn pos-btn--secondary pos-btn--sm"
            onClick={listAction.onTrigger}
            aria-label={listAction.label}
            title={listAction.label}
          >
            ⋯
          </button>
        )}
      </div>

      {hint && <p className="pos-hint pos-ss__hint">{hint}</p>}

      {/* Dropdown */}
      {showDropdown && hasSuggestions ? (
        <ul id={listboxId} className="pos-autocomplete__list" role="listbox">
          {suggestions.map((sg, idx) => (
            <li
              key={itemKey(sg.item)}
              id={`${listboxId}-${idx}`}
              role="option"
              aria-selected={idx === highlightIdx}
              aria-disabled={sg.disabled}
              className={[
                "pos-autocomplete__item",
                idx === highlightIdx ? "pos-autocomplete__item--active" : "",
                sg.disabled ? "pos-autocomplete__item--disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!sg.disabled) selectItem(sg.item);
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              <span className="pos-autocomplete__name">
                {renderItem(sg.item)}
              </span>
              {renderMeta && (
                <span className="pos-autocomplete__meta">
                  {renderMeta(sg.item)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {showDropdown && !hasSuggestions && !loading ? (
        <div className="pos-autocomplete__list pos-autocomplete__empty">
          Không tìm thấy.
          {createAction && (
            <button
              type="button"
              className="pos-btn pos-btn--primary pos-btn--sm"
              style={{ marginLeft: "0.5rem" }}
              onClick={() => createAction.onTrigger(value.trim())}
            >
              {createAction.label}
            </button>
          )}
        </div>
      ) : null}

      {showDropdown && loading ? (
        <div className="pos-autocomplete__list pos-autocomplete__empty">
          Đang tìm…
        </div>
      ) : null}
    </div>
  );
}
