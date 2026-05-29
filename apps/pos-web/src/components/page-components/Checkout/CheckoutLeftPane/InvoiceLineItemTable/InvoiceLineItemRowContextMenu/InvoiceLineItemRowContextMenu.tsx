import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@erp/ui";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

const MENU_WIDTH = 240;
const VIEWPORT_MARGIN = 8;

interface MenuItem {
  label: string;
  onSelect: (lineId: string) => void;
}

/**
 * Right-click popover trên dòng `InvoiceLineItemRow`. Đọc state mở/đóng + toạ
 * độ từ `usePosCheckoutUiStore.lineContextMenu`; render qua portal vào body để
 * tránh bị clip bởi `overflow-auto` của container bảng. Tự dịch về phía trong
 * viewport nếu vượt mép phải/dưới. Click ngoài hoặc Esc → đóng.
 */
export function InvoiceLineItemRowContextMenu() {
  const lineContextMenu = usePosCheckoutUiStore((s) => s.lineContextMenu);
  const closeLineContextMenu = usePosCheckoutUiStore(
    (s) => s.closeLineContextMenu,
  );
  const openRecentPriceDialog = usePosCheckoutUiStore(
    (s) => s.openRecentPriceDialog,
  );
  const openLineDiscountDialog = usePosCheckoutUiStore(
    (s) => s.openLineDiscountDialog,
  );
  const startEditLineNote = usePosCheckoutUiStore((s) => s.startEditLineNote);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!lineContextMenu) {
      setPos(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = menuRef.current;
    const height = el?.offsetHeight ?? 160;
    let left = lineContextMenu.x;
    let top = lineContextMenu.y;
    if (left + MENU_WIDTH + VIEWPORT_MARGIN > vw) {
      left = Math.max(VIEWPORT_MARGIN, vw - MENU_WIDTH - VIEWPORT_MARGIN);
    }
    if (top + height + VIEWPORT_MARGIN > vh) {
      top = Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN);
    }
    setPos({ left, top });
  }, [lineContextMenu]);

  useEffect(() => {
    if (!lineContextMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLineContextMenu();
    };
    const onClickOutside = (e: MouseEvent) => {
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) {
        closeLineContextMenu();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [lineContextMenu, closeLineContextMenu]);

  if (!lineContextMenu || !pos) return null;

  const items: MenuItem[] = [
    {
      label: "Xem giá bán gần nhất",
      onSelect: (lineId) => openRecentPriceDialog(lineId),
    },
    {
      label: "Khuyến mại",
      onSelect: (lineId) => openLineDiscountDialog(lineId),
    },
    {
      label: "Ghi chú",
      onSelect: (lineId) => startEditLineNote(lineId),
    },
  ];

  const node = (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
      className="fixed z-[100] divide-y divide-[#ECEDF1] overflow-hidden rounded-xl border border-black/5 bg-white shadow-[0_4px_16px_rgba(20,20,40,0.12)]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          type="button"
          onClick={() => item.onSelect(lineContextMenu.lineId)}
          className={cn(
            "block w-full px-5 py-3 text-left text-[14px] text-[#2D3142]",
            "transition-colors hover:bg-[#F3F2FB] active:bg-[#E9E8F8]",
            "focus:outline-none focus-visible:bg-[#F3F2FB]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return createPortal(node, document.body);
}
