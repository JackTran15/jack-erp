import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@erp/ui";
import {
  ChevronDownIcon,
  CloseIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
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

/**
 * Điều khiển popover từ ngoài. Cần cho consumer nào chọn item bằng đường không
 * đi qua `selectItem` (vd tự chọn sau khi tra mã vạch) — không có nó thì popover
 * ở lại với danh sách rỗng và render khung "Không có kết quả." treo dưới ô.
 */
export interface PosSearchPopoverHandle {
  close: () => void;
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

  /**
   * Nạp trang kế tiếp khi cuộn gần đáy dropdown. Nhận query hiện tại và số dòng
   * đã có; trả mảng rỗng nghĩa là hết dữ liệu.
   *
   * Khi truyền prop này, `maxSuggestions` không còn cắt danh sách — còn cắt thì
   * mọi trang nạp thêm bị bỏ ngay khi vừa về. Không truyền thì mọi thứ y như cũ:
   * component này còn đỡ `PosSelect` và các picker khác.
   *
   * Nên bọc `useCallback`: đây là dependency duy nhất của `loadNextPage`, nên
   * identity đổi mỗi lần render sẽ khiến effect auto-fill chạy lại mỗi render và
   * đọc layout của dropdown mỗi lần (vô hại nhưng thừa).
   */
  loadMore?: (
    query: string,
    loadedCount: number,
  ) => Promise<SearchSuggestion<T>[]>;

  /**
   * Làm nổi sẵn dòng đầu tiên ngay khi danh sách gợi ý hiện ra, để Enter chọn
   * được nó mà không phải bấm mũi tên hay chạm chuột.
   *
   * Mặc định tắt, và phải giữ như vậy: `PosSelect` cũng dựng trên component này,
   * nên bật mặc định là đổi hành vi Enter của mọi dropdown trong POS.
   */
  autoHighlightFirst?: boolean;

  /** Extra slots — rendered before/after the input inside the wrapper. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Class for the bordered wrapper that holds prefix/input/suffix. */
  containerClassName?: string;
  /** Class for the bare <input>. */
  inputClassName?: string;

  inputRef?: Ref<HTMLInputElement>;

  /** Handle để consumer đóng popover bằng lệnh — xem `PosSearchPopoverHandle`. */
  popoverRef?: Ref<PosSearchPopoverHandle>;

  /**
   * When provided and `value` is non-empty, the preset chrome renders a
   * focusable X button (replacing the chevron) that calls `onClear` and
   * refocuses the input. Lets keyboard users Shift+Tab onto the clear button
   * and press Enter to wipe the field.
   */
  onClear?: () => void;

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
  loadMore,
  autoHighlightFirst = false,
  prefix,
  suffix,
  containerClassName,
  inputClassName,
  inputRef,
  popoverRef,
  onClear,
  emptyAction,
}: PosSearchPopoverProps<T>) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bỏ qua lần search do refocus ngay sau khi clear (value lúc đó vẫn là giá trị
  // cũ chưa flush → tránh dropdown lọc theo option vừa xóa).
  const skipFocusSearchRef = useRef(false);
  // Số thứ tự lượt tra: chỉ lượt mới nhất được phép ghi kết quả. Không có nó,
  // một kết quả về trễ của chuỗi đã cũ có thể ghi đè danh sách của chuỗi hiện tại
  // — với `autoHighlightFirst` bật thì nó còn làm sáng sẵn dòng đầu của kết quả cũ,
  // đủ để phím Enter kế tiếp chọn nhầm mặt hàng.
  const searchSeqRef = useRef(0);
  // Toàn bộ trạng thái phân trang giữ trong ref, không phải state: sự kiện cuộn
  // bắn nhiều lần trong một frame và đọc xong trước khi React kịp render lại,
  // nên cờ đặt bằng setState vẫn còn giá trị cũ ở lần bắn kế tiếp cùng tick.
  // `loadingMore` bên dưới chỉ để vẽ dòng "Đang tải…".
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const exhaustedRef = useRef(false);
  /**
   * Con trỏ offset: số dòng đã **xin về từ server**, không phải số dòng đang
   * hiện. Hai con số lệch nhau khi bước lọc trùng lúc append bỏ bớt dòng — và
   * offset phải theo con số của server, nếu không lần xin kế tiếp lấy lại đúng
   * phần vừa trùng, mãi mãi. Ref vì `loadNextPage` đọc nó sau await, lúc closure
   * đã cũ.
   */
  const loadedCountRef = useRef(0);
  /**
   * Query mà danh sách hiện tại thuộc về — **không** phải `value`. `value` đổi
   * ngay khi gõ còn danh sách chỉ đổi sau debounce; xin trang bằng `value` là
   * lấy trang của query mới nối vào danh sách của query cũ.
   */
  const activeQueryRef = useRef("");
  const listRef = useRef<HTMLDivElement>(null);
  /**
   * `itemKey` đi qua ref chứ không vào deps của `loadNextPage`: hầu hết call site
   * truyền arrow inline, nên để trong deps là `loadNextPage` đổi identity mỗi lần
   * render, kéo theo effect auto-fill đọc layout dropdown mỗi lần render — kể cả
   * khi chỉ rê chuột qua một dòng (`onMouseEnter` → `setHighlightIdx`).
   */
  const itemKeyRef = useRef(itemKey);
  itemKeyRef.current = itemKey;

  const [suggestions, setSuggestions] = useState<SearchSuggestion<T>[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  /** Mỗi query là một chuỗi trang mới; không kế thừa trạng thái "đã hết" của query trước. */
  const resetPaging = useCallback(() => {
    loadingMoreRef.current = false;
    exhaustedRef.current = false;
    loadedCountRef.current = 0;
    setLoadingMore(false);
  }, []);

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
      resetPaging();
      if (q.length < minChars) {
        setSuggestions([]);
        return;
      }
      const seq = ++searchSeqRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const results = await search(q);
        if (seq !== searchSeqRef.current) return;
        // Có `loadMore` thì việc giới hạn là của server: cắt ở đây sẽ vứt đúng
        // những dòng mà lần cuộn kế tiếp vừa xin về.
        const shown = loadMore ? results : results.slice(0, maxSuggestions);
        setSuggestions(shown);
        loadedCountRef.current = shown.length;
        activeQueryRef.current = q;
        // Trang 1 rỗng là đã hết, không phải "chưa nạp". Không chốt ở đây thì
        // auto-fill lại đi xin trang 1 lần nữa cho mọi lần tìm không ra kết quả.
        if (shown.length === 0) exhaustedRef.current = true;
        setHighlightIdx(autoHighlightFirst && shown.length > 0 ? 0 : -1);
      } catch {
        if (seq !== searchSeqRef.current) return;
        setSuggestions([]);
        loadedCountRef.current = 0;
        // Cả hai dòng này là bắt buộc: bỏ chúng thì khung "Không có kết quả."
        // vừa đủ thấp để auto-fill tưởng là danh sách chưa tràn, và nó đi xin
        // trang 1 của `activeQueryRef` — tức query trước đó, hoặc "" ở lần đầu.
        activeQueryRef.current = q;
        exhaustedRef.current = true;
        setHighlightIdx(-1);
      } finally {
        if (seq === searchSeqRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [autoHighlightFirst, search, loadMore, minChars, maxSuggestions, resetPaging],
  );

  const loadNextPage = useCallback(async () => {
    if (
      !loadMore ||
      // `loadingRef`: trang 1 của query hiện tại chưa về thì chưa có gì để nối
      // tiếp. Bỏ chốt này là thân dropdown co lại còn mỗi dòng "Đang tìm…",
      // trình duyệt kẹp `scrollTop` và bắn một sự kiện cuộn chạm đáy — đủ để xin
      // trang 2 bằng offset của query trước.
      loadingRef.current ||
      loadingMoreRef.current ||
      exhaustedRef.current
    )
      return;
    // Chốt số thứ tự lượt tra như `runSearch` làm: một trang về trễ của chuỗi đã
    // cũ mà nối vào đây thì danh sách hiện tại lẫn kết quả của query trước.
    const seq = searchSeqRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const more = await loadMore(
        activeQueryRef.current,
        loadedCountRef.current,
      );
      if (seq !== searchSeqRef.current) return;
      if (more.length === 0) {
        exhaustedRef.current = true;
        return;
      }
      loadedCountRef.current += more.length;
      setSuggestions((prev) => {
        // Lọc trùng theo `itemKey`: một `loadMore` bỏ qua `loadedCount` sẽ trả
        // lại đúng trang cũ, và key trùng trên <li> là lỗi React chứ không phải
        // chỉ là dòng thừa.
        const key = itemKeyRef.current;
        const seen = new Set(prev.map((sg) => key(sg.item)));
        return [...prev, ...more.filter((sg) => !seen.has(key(sg.item)))];
      });
    } catch {
      // Dừng hẳn thay vì thử lại: cuộn tiếp sẽ gọi lại ngay và biến một endpoint
      // đang lỗi thành vòng lặp request.
      if (seq === searchSeqRef.current) exhaustedRef.current = true;
    } finally {
      // Chỉ lượt còn hiện hành mới được nhả cờ. Nếu không, một trang cũ về muộn
      // sẽ nhả cờ hộ lượt đang chạy và lần cuộn kế tiếp xin trùng đúng trang đó.
      if (seq === searchSeqRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [loadMore]);

  const handleChange = useCallback(
    (val: string) => {
      onValueChange(val);
      setHighlightIdx(-1);
      setOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const q = val.trim();
      if (q.length < minChars) {
        resetPaging();
        setSuggestions([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(q);
      }, debounceMs);
    },
    [onValueChange, runSearch, minChars, debounceMs, resetPaging],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Trang đầu không tràn khỏi khung thì không có sự kiện cuộn nào để mà nạp
  // tiếp, và danh sách dừng ở trang 1 mà không báo gì. Cùng cách xử lý với
  // LookupField ở backoffice-web.
  useEffect(() => {
    // `suggestions.length === 0`: auto-fill nghĩa là "trang đầu chưa tràn khung",
    // điều đó giả định đã có trang đầu.
    if (!open || !loadMore || loading || exhaustedRef.current) return;
    if (suggestions.length === 0) return;
    const el = listRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 1) void loadNextPage();
  }, [open, loading, loadMore, loadNextPage, suggestions]);

  // Danh sách 8 dòng thì luôn vừa khung nên chưa bao giờ cần cuộn theo highlight.
  // Có `loadMore` là danh sách không còn giới hạn, và người dùng bàn phím sẽ mất
  // dấu highlight sau vài dòng nếu không kéo nó vào tầm nhìn.
  useEffect(() => {
    if (highlightIdx < 0) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(`${listboxId}-${highlightIdx}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, listboxId]);

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

  const closePopover = useCallback(() => {
    // Huỷ luôn lượt tra còn đang chờ debounce: nó chạy sau khi popover đã đóng
    // thì kết quả rơi vào một danh sách không ai nhìn, và lần mở kế tiếp thừa
    // hưởng đúng danh sách đó.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
    setSuggestions([]);
    setHighlightIdx(-1);
    resetPaging();
  }, [resetPaging]);

  useImperativeHandle(popoverRef, () => ({ close: closePopover }), [
    closePopover,
  ]);

  const selectItem = useCallback(
    (item: T) => {
      onSelect(item);
      closePopover();
    },
    [closePopover, onSelect],
  );

  const handleClear = useCallback(() => {
    if (!onClear) return;
    onClear();
    setSuggestions([]);
    setHighlightIdx(-1);
    resetPaging();
    // Refocus fire onFocus với value cũ → skip lần đó, rồi tự load lại option
    // cho query rỗng (minChars 0 → hiện đủ danh sách; minChars cao → rỗng).
    skipFocusSearchRef.current = true;
    internalInputRef.current?.focus();
    void runSearch("");
  }, [onClear, runSearch, resetPaging]);

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
        // Ở dòng cuối mà còn trang: nạp tiếp thay vì quay về đầu. Quay vòng ở
        // đây nghĩa là người dùng bàn phím không bao giờ tới được trang 2.
        if (
          loadMore &&
          !exhaustedRef.current &&
          highlightIdx === suggestions.length - 1
        ) {
          void loadNextPage();
          break;
        }
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
  const showClearButton = Boolean(onClear) && value.length > 0 && !disabled;
  const resolvedSuffix = preset
    ? (suffix ??
      (showClearButton ? (
        <button
          type="button"
          aria-label="Xóa giá trị"
          onClick={handleClear}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/50"
        >
          <CloseIcon size={14} />
        </button>
      ) : (
        <span className="flex shrink-0 items-center text-gray-400">
          <ChevronDownIcon
            size={14}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      )))
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
            if (skipFocusSearchRef.current) {
              skipFocusSearchRef.current = false;
              return;
            }
            // `activeQueryRef`: danh sách đang giữ có thể thuộc về một chuỗi
            // khác chuỗi đang nằm trong ô — một lượt tra về sau khi popover đã
            // đóng, hoặc consumer tự thay `value` bằng đường ngoài. Chỉ xét
            // `suggestions.length === 0` thì lần mở kế tiếp hiện lại đúng danh
            // sách cũ và không bao giờ tra lại.
            if (
              trimmed.length >= minChars &&
              (suggestions.length === 0 || activeQueryRef.current !== trimmed)
            ) {
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
        <div
          ref={listRef}
          onScroll={
            loadMore
              ? (e) => {
                  const el = e.currentTarget;
                  // 32px trước đáy: nạp lúc người dùng còn đang cuộn, thay vì đợi
                  // họ chạm đáy rồi mới thấy khựng.
                  if (
                    el.scrollTop + el.clientHeight >=
                    el.scrollHeight - 32
                  ) {
                    void loadNextPage();
                  }
                }
              : undefined
          }
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {loading ? (
            <div className="px-3 py-2 text-[13px] text-gray-500">Đang tìm…</div>
          ) : hasSuggestions ? (
            <>
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
              {loadingMore ? (
                <div className="px-3 py-2 text-[13px] text-gray-500">
                  Đang tải…
                </div>
              ) : null}
            </>
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
