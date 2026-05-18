import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@erp/ui";
import {
  ChevronDownIcon,
  LogOutIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";

export interface PosUserMenuProps {
  name: string;
  /** Initials override; falls back to first letter of `name`. */
  initials?: string;
  onLogout: () => void;
}

interface PanelPosition {
  top: number;
  right: number;
}

/**
 * Avatar + name trigger that opens a popover with a logout action.
 * Renders the popover via portal so it escapes the topbar stacking context;
 * click-outside on the scrim and Escape both close it.
 */
export function PosUserMenu({ name, initials, onLogout }: PosUserMenuProps) {
  const fallback = (initials ?? name.charAt(0)).toUpperCase();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [open]);

  const handleLogoutClick = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-gray-700 transition-colors hover:bg-gray-100",
          open && "bg-gray-100",
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-[12px] font-semibold text-white">
          {fallback}
        </span>
        <span className="font-medium">{name}</span>
        <ChevronDownIcon
          size={14}
          className={cn(
            "text-gray-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && position
        ? createPortal(
            <>
              <div
                aria-hidden
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40"
              />
              <div
                role="menu"
                aria-label="Tài khoản"
                style={{ top: position.top, right: position.right }}
                className="fixed z-50 w-[240px] rounded-xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-[14px] font-semibold text-white">
                    {fallback}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-gray-900">
                      {name}
                    </div>
                    <div className="truncate text-[12px] text-gray-500">
                      Thu ngân
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-100" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogoutClick}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[14px] text-red-600 transition-colors hover:bg-red-50 focus:bg-red-50 focus:outline-none"
                >
                  <LogOutIcon size={16} />
                  <span className="font-medium">Đăng xuất</span>
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
