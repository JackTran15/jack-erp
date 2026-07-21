import * as React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { AppModal } from "./app-modal";
import { PageToolbar, type ToolbarItem } from "./page-toolbar";
import { cn } from "./../lib/utils";

interface DocumentFormCollapseBarProps {
  collapsed: boolean;
  onToggle: () => void;
  collapseLabel?: string;
  expandLabel?: string;
  className?: string;
}

function DocumentFormCollapseBar({
  collapsed,
  onToggle,
  collapseLabel = "Thu gọn",
  expandLabel = "Mở rộng",
  className,
}: DocumentFormCollapseBarProps) {
  return (
    <div className={cn("relative shrink-0 py-1", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
      />
      <button
        type="button"
        className={cn(
          "relative z-10 mx-auto flex items-center gap-1 rounded border bg-background px-3 py-0.5 text-xs font-medium text-indigo-600 shadow-sm hover:bg-gray-100",
        )}
        onClick={onToggle}
      >
        {collapsed ? expandLabel : collapseLabel}
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the AppModal header (e.g. "Thêm mới phiếu nhập kho"). */
  title: string;
  /** Toolbar action items rendered as a primary-tone PageToolbar at the top. */
  toolbarItems: ToolbarItem[];
  /**
   * Optional row above THÔNG TIN CHUNG (e.g. "Mục đích nhập kho" radio group,
   * or supplier picker for outbound forms).
   */
  purpose?: React.ReactNode;
  /** Left column under THÔNG TIN CHUNG. */
  generalInfo?: React.ReactNode;
  /** Right column under CHỨNG TỪ. */
  documentInfo?: React.ReactNode;
  /**
   * Full-width header block (replaces purpose + two-column header when set).
   * Use for layouts that do not fit the default general/document split.
   */
  headerContent?: React.ReactNode;
  /** Optional row(s) below the two columns: Tham chiếu, Tài liệu đính kèm, ... */
  attachments?: React.ReactNode;
  /** CHI TIẾT region — typically a <LineItemGrid />. */
  detail: React.ReactNode;
  /** Right-aligned action chips next to the CHI TIẾT label (Quét mã vạch, Chọn kho, Nhập khẩu). */
  detailActions?: React.ReactNode;
  /** Footer row below the line grid (Số dòng = N, sums). */
  footerSummary?: React.ReactNode;
  /** Default size when the windowed modal opens. */
  defaultWidth?: number;
  defaultHeight?: number;
  /** Initial collapsed state of the THÔNG TIN CHUNG section. */
  defaultCollapsed?: boolean;
  /**
   * Where the scrollbar lives.
   * - `sections` (default): the header block and the line grid each scroll on
   *   their own, so the grid keeps its sticky header/footer. Right for
   *   inventory documents with hundreds of lines.
   * - `page`: one scrollbar for everything between the toolbar and the footer
   *   summary (both stay pinned). Right for voucher forms, whose grid is short
   *   but whose header grows with the chosen purpose.
   */
  scroll?: "sections" | "page";
  className?: string;
}

export function DocumentFormDialog({
  open,
  onOpenChange,
  title,
  toolbarItems,
  purpose,
  generalInfo,
  documentInfo,
  headerContent,
  attachments,
  detail,
  detailActions,
  footerSummary,
  defaultWidth = 1100,
  defaultHeight = 720,
  defaultCollapsed = false,
  scroll = "sections",
  className,
}: DocumentFormDialogProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const pageScroll = scroll === "page";

  const header = !collapsed ? (
    <div
      className={cn(
        "shrink-0 px-2 pt-2",
        // In page mode the single outer scroller owns the overflow, so the
        // header must be free to take its natural height.
        !pageScroll && "max-h-[45%] overflow-y-auto",
      )}
    >
      {headerContent ? (
        headerContent
      ) : (
        <>
          {purpose ? <div className="mb-3">{purpose}</div> : null}
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-[7fr_3fr]">
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Thông tin chung
              </h3>
              <div className="space-y-1">{generalInfo}</div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Chứng từ
              </h3>
              <div className="space-y-1">{documentInfo}</div>
            </section>
          </div>
          {attachments ? (
            <div className="mt-3 space-y-2">{attachments}</div>
          ) : null}
        </>
      )}
    </div>
  ) : null;

  const detailLabel = (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center justify-between border-b px-2",
        // Keeps the CHI TIẾT caption in view while the single scroller moves.
        pageScroll && "sticky top-0 z-20 bg-background",
      )}
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Chi tiết
      </h3>
      {detailActions ? (
        <div className="flex h-full items-center gap-1 text-sm [&_button]:h-8 [&_button]:rounded-sm [&_button]:px-2 [&_label]:h-8 [&_label]:px-2">
          {detailActions}
        </div>
      ) : null}
    </div>
  );

  const collapseBar = (
    <DocumentFormCollapseBar
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
    />
  );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      defaultWidth={defaultWidth}
      defaultHeight={defaultHeight}
      showFooter={false}
      className={cn("min-w-[800px]", className)}
    >
      <div className="flex h-full min-h-0 flex-col">
        {toolbarItems.length > 0 ? (
          <div className="shrink-0">
            <PageToolbar
              tone="primary"
              items={toolbarItems}
              className="rounded-none"
            />
          </div>
        ) : null}

        {pageScroll ? (
          // One scroller for header + grid; toolbar above and summary below
          // stay pinned.
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {header}
            {collapseBar}
            {detailLabel}
            <div className="flex flex-col">{detail}</div>
          </div>
        ) : (
          <>
            {header}
            {collapseBar}
            {detailLabel}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {detail}
            </div>
          </>
        )}

        {footerSummary ? (
          <div className="shrink-0 border-t bg-muted/40 px-4 py-2 text-sm font-medium">
            {footerSummary}
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
