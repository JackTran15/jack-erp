import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchSelectModalProps<T, TCreate = void> {
  open: boolean;
  onClose: () => void;

  /** Called when an existing item is picked or a new one is created. */
  onSelect: (item: T) => void;

  title: string;

  // ---- Search / listing ----

  /** Async search for listing items. */
  search: (query: string) => Promise<T[]>;

  /** Unique key extractor. */
  itemKey: (item: T) => string;

  /** Render a single result row. */
  renderItem: (item: T) => ReactNode;

  /** Placeholder for the search input. */
  searchPlaceholder?: string;

  /** Minimum search chars (default 2). */
  minSearchChars?: number;

  // ---- Create form (optional) ----

  /** If provided, a "create" section is shown. */
  createForm?: {
    /** Render the create form.
     *  `defaultValues` are derived from the current search query (e.g. phone).
     *  The form should call `onCreated(item)` when done. */
    render: (props: {
      defaultValues: TCreate;
      onCreated: (item: T) => void;
      onCancel: () => void;
    }) => ReactNode;

    /** Build default values from the current search query string. */
    buildDefaults: (query: string) => TCreate;

    /** Label for the toggle button. */
    label?: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchSelectModal<T, TCreate = void>({
  open,
  onClose,
  onSelect,
  title,
  search,
  itemKey,
  renderItem,
  searchPlaceholder = "Tìm kiếm…",
  minSearchChars = 2,
  createForm,
}: SearchSelectModalProps<T, TCreate>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Open / close native dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setQuery("");
      setResults([]);
      setLoading(false);
      setError("");
      setShowCreate(false);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (q.length < minSearchChars) {
        setError(`Nhập ít nhất ${minSearchChars} ký tự.`);
        setResults([]);
        return;
      }
      setError("");
      setLoading(true);
      try {
        const rows = await search(q);
        setResults(rows);
        if (rows.length === 0) {
          setError("Không tìm thấy. Tạo mới bên dưới nếu cần.");
          if (createForm) setShowCreate(true);
        }
      } catch (err) {
        setResults([]);
        setError(
          err instanceof Error ? err.message.slice(0, 300) : "Đã xảy ra lỗi.",
        );
      } finally {
        setLoading(false);
      }
    },
    [query, search, minSearchChars, createForm],
  );

  const handlePick = useCallback(
    (item: T) => {
      onSelect(item);
    },
    [onSelect],
  );

  const handleCreated = useCallback(
    (item: T) => {
      onSelect(item);
    },
    [onSelect],
  );

  return (
    <dialog
      ref={dialogRef}
      className="pos-dialog"
      aria-labelledby="ss-modal-title"
    >
      <div className="pos-dialog__inner">
        <div className="pos-dialog__header">
          <h2 id="ss-modal-title" className="pos-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="pos-btn pos-btn--secondary pos-btn--sm pos-dialog__close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="pos-dialog__body">
          {error && (
            <div className="pos-dialog__alert" role="alert">
              {error}
            </div>
          )}

          {/* Search form */}
          <form onSubmit={handleSearch} className="pos-ss-modal__search">
            <input
              ref={searchInputRef}
              className="pos-input"
              type="search"
              autoComplete="off"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError("");
              }}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="pos-btn pos-btn--primary pos-btn--sm"
              disabled={loading}
            >
              {loading ? "…" : "Tìm"}
            </button>
          </form>

          {/* Results */}
          {results.length > 0 && (
            <ul className="pos-ss-modal__results" role="listbox">
              {results.map((item) => (
                <li key={itemKey(item)} role="option">
                  <button
                    type="button"
                    className="pos-ss-modal__result-btn"
                    onClick={() => handlePick(item)}
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Create form (toggle) */}
          {createForm && (
            <div className="pos-ss-modal__create">
              {!showCreate ? (
                <button
                  type="button"
                  className="pos-btn pos-btn--secondary"
                  style={{ width: "100%" }}
                  onClick={() => setShowCreate(true)}
                >
                  {createForm.label ?? "Tạo mới"}
                </button>
              ) : (
                createForm.render({
                  defaultValues: createForm.buildDefaults(query.trim()),
                  onCreated: handleCreated,
                  onCancel: () => setShowCreate(false),
                })
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
