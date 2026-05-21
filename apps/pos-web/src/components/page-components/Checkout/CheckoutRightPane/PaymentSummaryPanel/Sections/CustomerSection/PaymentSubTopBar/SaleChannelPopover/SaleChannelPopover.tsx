import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@erp/ui";
import {
  SearchIcon,
  StoreIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  posFormFieldClass,
  posFormHeight,
  posFormPadX,
  posFormRadius,
  posFormRowClass,
} from "@erp/pos/components/common/posFormDimensions";
import { SALE_CHANNELS } from "@erp/pos/constants/checkout.constant";

export interface SaleChannelPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The button that opens the popover; used to anchor positioning. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Id of the channel currently selected (highlighted). */
  selectedId: string;
  /** Called when the user picks a channel row. */
  onSelect: (id: string) => void;
}

interface PanelPosition {
  top: number;
  right: number;
}

/**
 * Sales-channel selector anchored under the "Tại cửa hàng" dropdown button.
 * Renders a backdrop scrim + panel via portal (mirrors `PosMenuPopover`) so it
 * escapes the panel's stacking context. Chrome (search field, option rows,
 * accent màu indigo) bám theo `PosSelect` / `posFormDimensions` để nhất quán.
 */
export function SaleChannelPopover({
  open,
  onClose,
  triggerRef,
  selectedId,
  onSelect,
}: SaleChannelPopoverProps) {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function compute() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, triggerRef]);

  // Reset the query and focus the search input each time the popover opens.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SALE_CHANNELS;
    return SALE_CHANNELS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  if (!open || !position) return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />
      <div
        role="dialog"
        aria-label="Chọn kênh bán hàng"
        style={{ top: position.top, right: position.right }}
        className="fixed z-50 w-[280px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
      >
        <div className="p-2">
          <div
            className={cn(
              posFormRowClass,
              posFormHeight.md,
              posFormRadius.md,
              posFormPadX.md,
              "border border-gray-200 bg-white text-gray-700 transition-[border-color,box-shadow] duration-150 ease-out",
              "focus-within:border-[#5C6BC0] focus-within:ring-2 focus-within:ring-[#5C6BC0]/30",
            )}
          >
            <span className="flex shrink-0 items-center text-gray-500">
              <SearchIcon size={16} />
            </span>
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm kiếm"
              aria-label="Tìm kiếm kênh bán hàng"
              className={cn(posFormFieldClass, "placeholder:text-gray-400")}
            />
          </div>
        </div>

        {filtered.length > 0 ? (
          <ul role="listbox" className="max-h-72 overflow-auto pb-1">
            {filtered.map((channel) => {
              const selected = channel.id === selectedId;
              return (
                <li key={channel.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onSelect(channel.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
                      selected
                        ? "bg-indigo-100 text-[#4F46E5]"
                        : "text-gray-900 hover:bg-indigo-50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white",
                        channel.bubbleClassName,
                      )}
                    >
                      {channel.isStore ? (
                        <StoreIcon size={18} className="text-white" />
                      ) : (
                        channel.initial
                      )}
                    </span>
                    <span className="truncate">{channel.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-3 py-2 text-[13px] text-gray-500">
            Không tìm thấy kênh phù hợp
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
