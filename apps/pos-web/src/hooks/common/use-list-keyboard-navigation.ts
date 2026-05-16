import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface UseListKeyboardNavigationInput<T> {
  /** List of items in the dropdown / menu. */
  items: ReadonlyArray<T>;
  /** Open state. When false, the hook resets highlightIdx to -1. */
  open: boolean;
  /** Disabled item — arrow navigation skips it, Enter does not fire. */
  isDisabled?: (item: T, index: number) => boolean;
  /**
   * Initial index when `open` transitions from false → true.
   * - If it lands on a disabled item, the hook jumps to the nearest enabled
   *   item going down, with fallback going up, fallback `-1`.
   * - Default: `0`.
   */
  initialIndex?: number;
  /** Called when Enter is pressed on an enabled item (the hook does not auto-select — caller handles it). */
  onSelect: (item: T, index: number) => void;
  /** Called on Escape. Callers typically use this to close the dropdown. */
  onEscape?: () => void;
}

export interface UseListKeyboardNavigationResult {
  /** Currently highlighted index. `-1` means no item is highlighted. */
  highlightIdx: number;
  /** Setter — used by callers to sync with mouse hover (`onMouseEnter`). */
  setHighlightIdx: (next: number) => void;
  /**
   * Wire to the `onKeyDown` of a trigger / input / container. Handles
   * ArrowUp/Down, Enter, Escape — including `preventDefault` for handled keys.
   */
  handleKeyDown: (e: KeyboardEvent | ReactKeyboardEvent) => void;
}

/**
 * Generic keyboard navigation hook for dropdown / popover menus.
 *
 * Extracted from the repeated pattern in `SearchPopover` to be reused in
 * `PosSelect` and `PromoMenu`. Agnostic to UI rendering —
 * callers apply highlight class + aria-selected based on `highlightIdx`.
 *
 * Behaviour:
 *   - Open (`open` false → true): set `highlightIdx = initialIndex`, clamp to
 *     nearest enabled item if it lands on a disabled one.
 *   - Close (`open === false`): reset `highlightIdx = -1`.
 *   - ArrowDown / ArrowUp: jump to next / previous enabled item, wrap-around.
 *   - Enter: call `onSelect` if the highlighted item is enabled.
 *   - Escape: call `onEscape`.
 *
 * Disabled-skipping applies to both initialisation and arrow navigation.
 * If all items are disabled → `highlightIdx = -1`, Enter/Arrow are no-ops.
 */
export function useListKeyboardNavigation<T>({
  items,
  open,
  isDisabled,
  initialIndex = 0,
  onSelect,
  onEscape,
}: UseListKeyboardNavigationInput<T>): UseListKeyboardNavigationResult {
  const [highlightIdx, setHighlightIdx] = useState(-1);

  // Stable refs for callbacks / data — handleKeyDown does not need to be
  // recreated and does not capture stale state.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const isDisabledRef = useRef(isDisabled);
  isDisabledRef.current = isDisabled;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const highlightIdxRef = useRef(highlightIdx);
  highlightIdxRef.current = highlightIdx;

  const computeEnabledIndex = useCallback(
    (start: number, direction: 1 | -1): number => {
      const list = itemsRef.current;
      const n = list.length;
      if (n === 0) return -1;
      const isDis = isDisabledRef.current;
      // Scan at most n times to avoid an infinite loop if all items are disabled.
      let idx = ((start % n) + n) % n;
      for (let i = 0; i < n; i += 1) {
        if (!isDis || !isDis(list[idx]!, idx)) return idx;
        idx = ((idx + direction) % n + n) % n;
      }
      return -1;
    },
    [],
  );

  // When `open` becomes true, set highlight to initialIndex (then clamp to
  // nearest enabled). When closed, reset to -1.
  useEffect(() => {
    if (!open) {
      setHighlightIdx(-1);
      return;
    }
    const n = items.length;
    if (n === 0) {
      setHighlightIdx(-1);
      return;
    }
    const seed = Math.max(0, Math.min(n - 1, initialIndex));
    // Try downward from seed; if no enabled item found, try upward.
    let resolved = computeEnabledIndex(seed, 1);
    if (resolved === -1) resolved = computeEnabledIndex(seed, -1);
    setHighlightIdx(resolved);
    // `initialIndex` is intentionally excluded from deps — only evaluated when
    // open becomes true. Prevents highlight from jumping when the caller
    // re-renders with a different initialIndex.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent | ReactKeyboardEvent) => {
      const list = itemsRef.current;
      if (list.length === 0) return;
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const current = highlightIdxRef.current;
          const start = current < 0 ? 0 : (current + 1) % list.length;
          setHighlightIdx(computeEnabledIndex(start, 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const current = highlightIdxRef.current;
          const n = list.length;
          const start = current <= 0 ? n - 1 : current - 1;
          setHighlightIdx(computeEnabledIndex(start, -1));
          break;
        }
        case "Enter": {
          // Only handle when an item is highlighted — do not intercept the
          // default Enter behaviour (form submit, …) when nothing is selected.
          const current = highlightIdxRef.current;
          if (current < 0 || current >= list.length) break;
          const item = list[current]!;
          const isDis = isDisabledRef.current;
          if (isDis && isDis(item, current)) break;
          e.preventDefault();
          onSelectRef.current(item, current);
          break;
        }
        case "Escape": {
          if (onEscapeRef.current) {
            e.preventDefault();
            onEscapeRef.current();
          }
          break;
        }
        default:
          break;
      }
    },
    [computeEnabledIndex],
  );

  return { highlightIdx, setHighlightIdx, handleKeyDown };
}
