import * as React from "react";
import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { Maximize2, Minimize2, X } from "lucide-react";

const DEFAULT_MIN_W = 320;
const DEFAULT_MIN_H = 220;
const VIEW_MARGIN = 16;
const TITLE_H = 40;

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Bounds = { x: number; y: number; w: number; h: number };

type Action = {
  kind: "drag" | "resize";
  edge: ResizeEdge | null;
  startX: number;
  startY: number;
  origin: Bounds;
  vw: number;
  vh: number;
  pointerId: number;
  target: HTMLElement;
};

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function clampPosition(x: number, y: number, w: number, vw: number, vh: number) {
  return {
    x: clamp(x, VIEW_MARGIN - w, vw - VIEW_MARGIN),
    y: clamp(y, 0, vh - TITLE_H),
  };
}

function clampSize(w: number, h: number, vw: number, vh: number, minW: number, minH: number) {
  return {
    w: clamp(w, minW, vw - VIEW_MARGIN * 2),
    h: clamp(h, minH, vh - VIEW_MARGIN * 2),
  };
}

function computeCentered(defaultWidth: number, defaultHeight: number, minW: number, minH: number): Bounds {
  if (typeof window === "undefined") {
    return { x: 0, y: 0, w: defaultWidth, h: defaultHeight };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sized = clampSize(defaultWidth, defaultHeight, vw, vh, minW, minH);
  return {
    x: Math.max(VIEW_MARGIN, Math.round((vw - sized.w) / 2)),
    y: Math.max(VIEW_MARGIN, Math.round((vh - sized.h) / 2)),
    w: sized.w,
    h: sized.h,
  };
}

export interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  onSave?: () => void | Promise<void>;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  showFooter?: boolean;
  /**
   * Custom footer content. When provided, replaces the default Save/Cancel
   * pair. Useful for dialogs that need additional actions (e.g. Trợ giúp,
   * Lưu và thêm mới) or a different layout.
   */
  footer?: React.ReactNode;
  className?: string;
  /** Class cho vùng nội dung (mặc định `overflow-auto`). Dùng `overflow-hidden` khi scroll nội bộ. */
  bodyClassName?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** Prevent the dialog from closing when the user clicks outside it. */
  preventOutsideClose?: boolean;
}

function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  onCancel,
  saveLabel = "Lưu",
  cancelLabel = "Huỷ",
  saveDisabled,
  showFooter = true,
  footer,
  className,
  bodyClassName,
  defaultWidth = 520,
  defaultHeight = 440,
  minWidth = DEFAULT_MIN_W,
  minHeight = DEFAULT_MIN_H,
  preventOutsideClose = false,
}: AppModalProps) {
  const [bounds, setBounds] = React.useState<Bounds>(() =>
    computeCentered(defaultWidth, defaultHeight, minWidth, minHeight),
  );
  const [maximized, setMaximized] = React.useState(false);

  // Refs read inside the high-frequency pointermove handler. Updated on each
  // render so the handler always sees fresh values without re-attaching.
  const boundsRef = React.useRef<Bounds>(bounds);
  const maximizedRef = React.useRef(false);
  const minWidthRef = React.useRef(minWidth);
  const minHeightRef = React.useRef(minHeight);
  boundsRef.current = bounds;
  maximizedRef.current = maximized;
  minWidthRef.current = minWidth;
  minHeightRef.current = minHeight;

  const preMaxRef = React.useRef<Bounds | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const actionRef = React.useRef<Action | null>(null);

  // Re-center whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    const next = computeCentered(defaultWidth, defaultHeight, minWidth, minHeight);
    setBounds(next);
    setMaximized(false);
    preMaxRef.current = null;
  }, [open, defaultWidth, defaultHeight, minWidth, minHeight]);

  // Stable hot-path handlers — created once per mount, read fresh state via refs.
  // This avoids re-attaching window listeners and lets us use passive: true.
  const handlersRef = React.useRef<{
    move: (e: PointerEvent) => void;
    end: () => void;
  } | null>(null);
  if (handlersRef.current === null) {
    const move = (e: PointerEvent) => {
      const action = actionRef.current;
      if (!action || maximizedRef.current) return;
      const el = contentRef.current;
      if (!el) return;
      const dx = e.clientX - action.startX;
      const dy = e.clientY - action.startY;
      const { origin, vw, vh, kind, edge } = action;

      if (kind === "drag") {
        const p = clampPosition(origin.x + dx, origin.y + dy, origin.w, vw, vh);
        boundsRef.current = { x: p.x, y: p.y, w: origin.w, h: origin.h };
        el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        return;
      }

      const east = edge!.indexOf("e") >= 0;
      const west = edge!.indexOf("w") >= 0;
      const south = edge!.indexOf("s") >= 0;
      const north = edge!.indexOf("n") >= 0;

      let w = origin.w;
      let h = origin.h;
      if (east) w = origin.w + dx;
      if (west) w = origin.w - dx;
      if (south) h = origin.h + dy;
      if (north) h = origin.h - dy;
      const sized = clampSize(w, h, vw, vh, minWidthRef.current, minHeightRef.current);
      w = sized.w;
      h = sized.h;
      let x = origin.x;
      let y = origin.y;
      if (west) x = origin.x + origin.w - w;
      if (north) y = origin.y + origin.h - h;
      const p = clampPosition(x, y, w, vw, vh);
      boundsRef.current = { x: p.x, y: p.y, w, h };
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
    };
    const end = () => {
      const action = actionRef.current;
      if (!action) return;
      try {
        action.target.releasePointerCapture(action.pointerId);
      } catch {
        /* ignore */
      }
      actionRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.body.style.pointerEvents = "";
      const el = contentRef.current;
      if (el) {
        el.style.willChange = "";
        el.style.pointerEvents = "";
        el.style.transition = "";
        el.style.boxShadow = "";
      }
      // Sync the committed value back to React state.
      setBounds(boundsRef.current);
    };
    handlersRef.current = { move, end };
  }

  const beginAction = (
    kind: "drag" | "resize",
    edge: ResizeEdge | null,
    e: React.PointerEvent,
    cursor: string,
  ) => {
    if (maximizedRef.current) return;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    actionRef.current = {
      kind,
      edge,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: boundsRef.current,
      vw: window.innerWidth,
      vh: window.innerHeight,
      target,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    document.body.style.pointerEvents = "none";
    const el = contentRef.current;
    if (el) {
      el.style.willChange = kind === "drag" ? "transform" : "transform, width, height";
      el.style.pointerEvents = "auto";
      el.style.transition = "none";
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.18)";
    }
    const h = handlersRef.current!;
    // skip the JS-blocked path and frees a frame of latency.
    window.addEventListener("pointermove", h.move, { passive: true });
    window.addEventListener("pointerup", h.end);
    window.addEventListener("pointercancel", h.end);
  };

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      const h = handlersRef.current;
      if (h) {
        window.removeEventListener("pointermove", h.move);
        window.removeEventListener("pointerup", h.end);
        window.removeEventListener("pointercancel", h.end);
      }
      // Defensive: if we unmount mid-gesture, restore body styles we set in
      // beginAction so the rest of the app stays interactive.
      if (actionRef.current) {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        document.body.style.pointerEvents = "";
        actionRef.current = null;
      }
    };
  }, []);

  const handleCancel = () => {
    if (onCancel) onCancel();
    else onOpenChange(false);
  };

  const toggleMaximize = () => {
    if (maximized) {
      const prev = preMaxRef.current;
      preMaxRef.current = null;
      setMaximized(false);
      if (prev) setBounds(prev);
      return;
    }
    preMaxRef.current = { ...boundsRef.current };
    setMaximized(true);
  };

  const onTitlePointerDown = (e: React.PointerEvent) => {
    if (maximized) return;
    if ((e.target as HTMLElement).closest("button")) return;
    beginAction("drag", null, e, "grabbing");
  };

  const startResize = (edge: ResizeEdge) => (e: React.PointerEvent) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    beginAction("resize", edge, e, `${edge}-resize`);
  };

  const frameStyle: React.CSSProperties = maximized
    ? {
        left: VIEW_MARGIN,
        top: VIEW_MARGIN,
        width: `calc(100vw - ${VIEW_MARGIN * 2}px)`,
        height: `calc(100vh - ${VIEW_MARGIN * 2}px)`,
        transform: "none",
        maxWidth: "none",
        maxHeight: "none",
      }
    : {
        left: 0,
        top: 0,
        width: bounds.w,
        height: bounds.h,
        transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
        maxWidth: "none",
        maxHeight: "none",
      };

  const handleBar = (edge: ResizeEdge, hClass: string) => (
    <div
      role="presentation"
      className={cn("absolute z-[60] touch-none", hClass)}
      onPointerDown={startResize(edge)}
    />
  );


  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-40 bg-black/25"
          />,
          document.body,
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      {overlay}
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        freePosition
        className={cn("gap-0 p-0 [contain:layout_paint]", className)}
        style={frameStyle}
        onPointerDownOutside={(event) => {
          if (preventOutsideClose) { event.preventDefault(); return; }
          const target = event.target as Element | null;
          if (
            target &&
            (target.closest("[data-lookup-popover]") ||
              target.closest('[role="dialog"]'))
          ) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (preventOutsideClose) { event.preventDefault(); return; }
          const target = event.target as Element | null;
          if (
            target &&
            (target.closest("[data-lookup-popover]") ||
              target.closest('[role="dialog"]'))
          ) {
            event.preventDefault();
          }
        }}
      >
        <div className="relative flex min-h-0 flex-1 flex-col">
          {!maximized ? (
            <>
              {handleBar("n", "left-2 right-2 top-0 h-1.5 cursor-ns-resize")}
              {handleBar("s", "bottom-0 left-2 right-2 h-1.5 cursor-ns-resize")}
              {handleBar("e", "bottom-2 right-0 top-2 w-1.5 cursor-ew-resize")}
              {handleBar("w", "bottom-2 left-0 top-2 w-1.5 cursor-ew-resize")}
              {handleBar("nw", "left-0 top-0 h-3 w-3 cursor-nwse-resize")}
              {handleBar("ne", "right-0 top-0 h-3 w-3 cursor-nesw-resize")}
              {handleBar("sw", "bottom-0 left-0 h-3 w-3 cursor-nesw-resize")}
              {handleBar("se", "bottom-0 right-0 h-3 w-3 cursor-nwse-resize")}
            </>
          ) : null}

          <div
            className="flex shrink-0 cursor-move select-none items-center gap-2 border-b bg-muted/60 px-2 pl-3"
            style={{ height: TITLE_H }}
            onPointerDown={onTitlePointerDown}
          >
            <DialogTitle className="min-w-0 flex-1 truncate text-left text-sm font-semibold leading-tight">
              {title}
            </DialogTitle>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleMaximize();
              }}
              aria-label={maximized ? "Thu nhỏ" : "Phóng to"}
              title={maximized ? "Thu nhỏ" : "Phóng to"}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onOpenChange(false);
              }}
              aria-label="Đóng"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 pt-3">
            {description ? (
              <DialogDescription asChild>
                <div className="shrink-0 text-sm text-muted-foreground">{description}</div>
              </DialogDescription>
            ) : null}
            <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>
              {children}
            </div>
          </div>

          {showFooter ? (
            footer ? (
              <div className="shrink-0 border-t bg-background px-4 py-3">{footer}</div>
            ) : (
              <DialogFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  {cancelLabel}
                </Button>
                {onSave ? (
                  <Button type="button" disabled={saveDisabled} onClick={() => void onSave()}>
                    {saveLabel}
                  </Button>
                ) : null}
              </DialogFooter>
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
AppModal.displayName = "AppModal";

export { AppModal };
