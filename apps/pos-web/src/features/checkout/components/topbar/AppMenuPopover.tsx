import { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppMenuTile } from "./AppMenuTile";
import { APP_MENU_ITEMS, type AppMenuItem } from "./appMenuItems";

export interface AppMenuPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Optional override; defaults to deriving from `useLocation()`. */
  selectedItemId?: string;
}

const CHECKOUT_PATHS = new Set(["/", "/v2"]);

function resolveSelectedId(pathname: string): string {
  const match = APP_MENU_ITEMS.find(
    (item) => item.route && item.route !== "/" && pathname.startsWith(item.route),
  );
  if (match) return match.id;
  if (CHECKOUT_PATHS.has(pathname)) return "ban-hang";
  return "";
}

/**
 * Floating launcher menu anchored under the "Menu ứng dụng" trigger.
 * Positions itself relative to the nearest `relative` ancestor; click-outside
 * and Escape both close it.
 */
export function AppMenuPopover({
  open,
  onClose,
  selectedItemId,
}: AppMenuPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const activeId = useMemo(
    () => selectedItemId ?? resolveSelectedId(location.pathname),
    [selectedItemId, location.pathname],
  );

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (item: AppMenuItem) => {
    if (item.route) navigate(item.route);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Menu ứng dụng"
      className="absolute right-0 top-[calc(100%+8px)] z-50 w-[430px] rounded-[20px] border border-gray-200 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
    >
      <div className="grid grid-cols-3">
        {APP_MENU_ITEMS.map((item) => (
          <AppMenuTile
            key={item.id}
            label={item.label}
            Icon={item.Icon}
            iconBgColor={item.iconBgColor}
            selected={item.id === activeId}
            badge={item.badge === "new" ? "New" : undefined}
            onClick={() => handleSelect(item)}
          />
        ))}
        <div aria-hidden />
      </div>
    </div>
  );
}
