import * as React from "react";
import { cn } from "../lib/utils";

export interface DocumentListShellProps {
  /** Bold page title shown on the left of the tab bar (e.g. "Nhập kho"). */
  title: React.ReactNode;
  /** Horizontal sub-page navigation. Render a <PageTabBar /> here. */
  tabs?: React.ReactNode;
  /** Action toolbar (Thêm mới, Sửa, Xóa, ...). Render a <PageToolbar /> here. */
  toolbar?: React.ReactNode;
  /** Period filter row (preset dropdown + từ-ngày/đến-ngày + Lấy dữ liệu). */
  filters?: React.ReactNode;
  /** Main data table region. Should manage its own scroll. */
  children: React.ReactNode;
  /**
   * Sticky aggregate row shown above pagination (e.g. "Tổng tiền: 2.328.606.500").
   */
  summary?: React.ReactNode;
  /** Pagination controls + result count. */
  pagination?: React.ReactNode;
  /**
   * Bottom detail panel — typically a <Tabs> with the "Chi tiết" tab listing
   * the lines of the currently selected master row.
   *
   * When provided, the panel is rendered with a horizontal drag handle at its
   * top edge so the user can resize it upward to reveal more lines.
   */
  detailPanel?: React.ReactNode;
  /** Initial detail panel height in px (default 280). */
  detailInitialHeight?: number;
  /** Min detail panel height in px (default 80). */
  detailMinHeight?: number;
  className?: string;
}

const MIN_TABLE_AREA_PX = 120;

export function DocumentListShell({
  title,
  tabs,
  toolbar,
  filters,
  children,
  summary,
  pagination,
  detailPanel,
  detailInitialHeight = 280,
  detailMinHeight = 80,
  className,
}: DocumentListShellProps) {
  const [detailHeight, setDetailHeight] = React.useState(detailInitialHeight);
  const detailRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = detailRef.current?.offsetHeight ?? detailHeight;
    const containerHeight = containerRef.current?.offsetHeight ?? window.innerHeight;
    const maxH = Math.max(detailMinHeight, containerHeight - MIN_TABLE_AREA_PX);

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    document.body.style.pointerEvents = "none";
    if (detailRef.current) {
      detailRef.current.style.pointerEvents = "auto";
      detailRef.current.style.transition = "none";
    }
    handle.style.pointerEvents = "auto";

    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      const next = Math.max(detailMinHeight, Math.min(maxH, startH + dy));
      if (detailRef.current) detailRef.current.style.height = `${next}px`;
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.body.style.pointerEvents = "";
      if (detailRef.current) {
        detailRef.current.style.pointerEvents = "";
        detailRef.current.style.transition = "";
        setDetailHeight(detailRef.current.offsetHeight);
      }
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
    >
      <div className="flex shrink-0 items-center gap-6 border-b px-4 py-2">
        <h1 className="text-base font-semibold">{title}</h1>
        {tabs ? <div className="min-w-0 flex-1">{tabs}</div> : null}
      </div>
      {toolbar ? <div className="shrink-0 border-b">{toolbar}</div> : null}
      {filters ? (
        <div className="shrink-0 border-b bg-muted/30 px-4 py-2">{filters}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
        {summary ? (
          <div className="shrink-0 border-t bg-muted/40 px-4 py-2 text-sm font-medium">
            {summary}
          </div>
        ) : null}
        {pagination ? (
          <div className="shrink-0 border-t bg-background px-4 py-1.5 text-sm">
            {pagination}
          </div>
        ) : null}
      </div>
      {detailPanel ? (
        <>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Kéo để thay đổi chiều cao panel chi tiết"
            tabIndex={0}
            onPointerDown={onResizeStart}
            className="group relative h-1.5 shrink-0 cursor-ns-resize touch-none border-t border-border bg-background hover:bg-foreground/5 focus:outline-none focus-visible:bg-foreground/10"
          >
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-0.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border group-hover:bg-foreground/40" />
          </div>
          <div
            ref={detailRef}
            className="shrink-0 overflow-auto bg-background"
            style={{ height: detailHeight }}
          >
            {detailPanel}
          </div>
        </>
      ) : null}
    </div>
  );
}
