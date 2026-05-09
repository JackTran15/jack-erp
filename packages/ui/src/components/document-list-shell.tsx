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
   */
  detailPanel?: React.ReactNode;
  className?: string;
}

export function DocumentListShell({
  title,
  tabs,
  toolbar,
  filters,
  children,
  summary,
  pagination,
  detailPanel,
  className,
}: DocumentListShellProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
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
        <div className="shrink-0 border-t bg-background">{detailPanel}</div>
      ) : null}
    </div>
  );
}
