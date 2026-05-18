import {
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNotificationItem } from "./PosNotificationItem/PosNotificationItem";

export interface NotificationItem {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  read?: boolean;
}

export interface PosNotificationPopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  notifications: NotificationItem[];
}

interface PanelPosition {
  top: number;
  right: number;
}

export function PosNotificationPopover({
  open,
  onClose,
  triggerRef,
  notifications,
}: PosNotificationPopoverProps) {
  const [position, setPosition] = useState<PanelPosition | null>(null);

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

  const isEmpty = notifications.length === 0;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />
      <div
        role="dialog"
        aria-label="Thông báo"
        style={{ top: position.top, right: position.right }}
        className="fixed z-50 flex h-[528px] w-[552px] flex-col rounded-[12px] border border-gray-200 bg-white px-6 py-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-[22px] font-bold leading-[1.3] text-[#1F2937]">
            Thông báo
          </h2>
          <PosIconButton
            ariaLabel="Đóng thông báo"
            icon={<CloseIcon size={18} />}
            onClick={onClose}
          />
        </header>

        <div className="mt-4 flex-1 overflow-y-auto" role="list">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm italic text-gray-400">
                Không có thông báo nào
              </p>
            </div>
          ) : (
            notifications.map((n, index) => (
              <PosNotificationItem
                key={n.id}
                timestamp={n.timestamp}
                title={n.title}
                description={n.description}
                read={n.read}
                showDivider={index < notifications.length - 1}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
