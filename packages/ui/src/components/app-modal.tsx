import * as React from "react";
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

type ActionContext = {
  startX: number;
  startY: number;
  origin: Bounds;
  viewportW: number;
  viewportH: number;
  pointerId: number;
  target: HTMLElement;
};

type PointerAction =
  | ({ kind: "drag" } & ActionContext)
  | ({ kind: "resize"; edge: ResizeEdge } & ActionContext);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function clampPosition(x: number, y: number, w: number, vw: number, vh: number) {
  const maxX = vw - VIEW_MARGIN;
  const minX = VIEW_MARGIN - w;
  return {
    x: clamp(x, minX, maxX),
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
  const x = Math.max(VIEW_MARGIN, Math.round((vw - sized.w) / 2));
  const y = Math.max(VIEW_MARGIN, Math.round((vh - sized.h) / 2));
  return { x, y, w: sized.w, h: sized.h };
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
  className?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
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
  className,
  defaultWidth = 520,
  defaultHeight = 440,
  minWidth = DEFAULT_MIN_W,
  minHeight = DEFAULT_MIN_H,
}: AppModalProps) {
  // bounds is the resting (committed) state; React owns it.
  // During drag/resize we mutate the DOM directly and only setBounds on pointerup.
  const [bounds, setBounds] = React.useState<Bounds>(() =>
    computeCentered(defaultWidth, defaultHeight, minWidth, minHeight),
  );
  const [maximized, setMaximized] = React.useState(false);
  const boundsRef = React.useRef<Bounds>(bounds);
  const maximizedRef = React.useRef(false);
  const preMaxRef = React.useRef<Bounds | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const actionRef = React.useRef<PointerAction | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const pendingRef = React.useRef<{ b: Bounds; sized: boolean } | null>(null);

  // Keep refs in sync with state.
  React.useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);
  React.useEffect(() => {
    maximizedRef.current = maximized;
  }, [maximized]);

  // Re-center whenever the dialog opens (resets any drag/resize/maximize from a prior session).
  React.useEffect(() => {
    if (!open) return;
    const next = computeCentered(defaultWidth, defaultHeight, minWidth, minHeight);
    boundsRef.current = next;
    setBounds(next);
    setMaximized(false);
    preMaxRef.current = null;
  }, [open, defaultWidth, defaultHeight, minWidth, minHeight]);

  const writeFrameToDom = React.useCallback((b: Bounds, sized: boolean) => {
    const el = contentRef.current;
    if (!el || maximizedRef.current) return;
    el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
    if (sized) {
      el.style.width = `${b.w}px`;
      el.style.height = `${b.h}px`;
    }
  }, []);

  const flushFrame = React.useCallback(() => {
    rafRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    boundsRef.current = pending.b;
    writeFrameToDom(pending.b, pending.sized);
  }, [writeFrameToDom]);

  const scheduleBounds = React.useCallback(
    (next: Bounds, sized: boolean) => {
      const prev = pendingRef.current;
      pendingRef.current = { b: next, sized: sized || (prev?.sized ?? false) };
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(flushFrame);
      }
    },
    [flushFrame],
  );

  const onPointerMove = React.useCallback(
    (e: PointerEvent) => {
      const action = actionRef.current;
      if (!action || maximizedRef.current) return;
      const dx = e.clientX - action.startX;
      const dy = e.clientY - action.startY;
      const { origin, viewportW: vw, viewportH: vh } = action;

      if (action.kind === "drag") {
        const p = clampPosition(origin.x + dx, origin.y + dy, origin.w, vw, vh);
        scheduleBounds({ x: p.x, y: p.y, w: origin.w, h: origin.h }, false);
        return;
      }

      const east = action.edge.includes("e");
      const west = action.edge.includes("w");
      const south = action.edge.includes("s");
      const north = action.edge.includes("n");

      let w = origin.w;
      let h = origin.h;
      if (east) w = origin.w + dx;
      if (west) w = origin.w - dx;
      if (south) h = origin.h + dy;
      if (north) h = origin.h - dy;
      const sized = clampSize(w, h, vw, vh, minWidth, minHeight);
      w = sized.w;
      h = sized.h;
      let x = origin.x;
      let y = origin.y;
      if (west) x = origin.x + origin.w - w;
      if (north) y = origin.y + origin.h - h;
      const p = clampPosition(x, y, w, vw, vh);
      scheduleBounds({ x: p.x, y: p.y, w, h }, true);
    },
    [scheduleBounds, minWidth, minHeight],
  );

  const endAction = React.useCallback(() => {
    const action = actionRef.current;
    if (!action) return;
    try {
      action.target.releasePointerCapture(action.pointerId);
    } catch {
      /* ignore */
    }
    actionRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endAction);
    window.removeEventListener("pointercancel", endAction);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    const el = contentRef.current;
    if (el) el.style.willChange = "";
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      // Apply final pending frame synchronously.
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        boundsRef.current = pending.b;
        writeFrameToDom(pending.b, pending.sized);
      }
    }
    // Sync committed bounds back into React state.
    setBounds(boundsRef.current);
  }, [onPointerMove, writeFrameToDom]);

  const beginAction = React.useCallback(
    (kind: "drag" | "resize", edge: ResizeEdge | null, e: React.PointerEvent, cursor: string) => {
      if (maximizedRef.current) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      actionRef.current = {
        kind,
        edge: edge as ResizeEdge,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...boundsRef.current },
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        target,
      } as PointerAction;
      document.body.style.userSelect = "none";
      document.body.style.cursor = cursor;
      const el = contentRef.current;
      if (el) el.style.willChange = kind === "drag" ? "transform" : "transform, width, height";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", endAction);
      window.addEventListener("pointercancel", endAction);
    },
    [onPointerMove, endAction],
  );

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
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
      if (prev) {
        boundsRef.current = prev;
        setBounds(prev);
      }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        freePosition
        className={cn("gap-0 p-0 [contain:layout_paint]", className)}
        style={frameStyle}
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
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </div>

          {showFooter ? (
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
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
AppModal.displayName = "AppModal";

export { AppModal };
