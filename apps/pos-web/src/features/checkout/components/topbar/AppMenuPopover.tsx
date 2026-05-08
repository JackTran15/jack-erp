import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AppMenuTile } from "./AppMenuTile";
import { APP_MENU_ITEMS, type AppMenuItem } from "./appMenuItems";

export interface AppMenuPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The button that opens the popover; used to anchor positioning. */
  triggerRef: RefObject<HTMLElement | null>;
  /** Optional override; defaults to deriving from `useLocation()`. */
  selectedItemId?: string;
}

interface PanelPosition {
  top: number;
  right: number;
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
 * Floating launcher menu anchored under its trigger button. Renders a backdrop
 * scrim + the panel via portal so they escape the topbar's stacking context;
 * the scrim dims page content beneath and dismisses the popover on click.
 * Escape also closes.
 */
export function AppMenuPopover({
  open,
  onClose,
  triggerRef,
  selectedItemId,
}: AppMenuPopoverProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const activeId = useMemo(
    () => selectedItemId ?? resolveSelectedId(location.pathname),
    [selectedItemId, location.pathname],
  );

  useLayoutEffect(() => {
    if (!open) return;
    function compute() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open, onClose]);

  if (!open || !position) return null;

  const handleSelect = (item: AppMenuItem) => {
    if (item.route) navigate(item.route);
    onClose();
  };

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />
      <div
        role="dialog"
        aria-label="Menu ứng dụng"
        style={{ top: position.top, right: position.right }}
        className="fixed z-50 w-[430px] rounded-[20px] border border-gray-200 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
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
    </>,
    document.body,
  );
}
