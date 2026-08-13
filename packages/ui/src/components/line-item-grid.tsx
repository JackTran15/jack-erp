import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Plus } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";
import { cn } from "../lib/utils";

export type LineColumnType = "text" | "number" | "readonly";

export interface LineColumn<R> {
  key: string;
  label: string;
  /** Optional grouped header shown above consecutive columns. */
  group?: string;
  type?: LineColumnType;
  width?: number | string;
  /**
   * Floor width for the column. Unlike `width` (a hint the auto-layout table
   * compresses when space is tight), `minWidth` prevents the column from
   * shrinking below this value — once the columns' min-widths sum past the
   * container, the grid scrolls horizontally instead of cramming.
   *
   * Defaults to `width` when omitted, so any column with a width already
   * resists compression. Set explicitly only to floor at a value different
   * from `width`.
   */
  minWidth?: number | string;
  /** Cell value to display (defaults to row[key]). */
  getValue?: (row: R) => string | number | undefined;
  /** Render the editor for this cell. If absent, an Input is used. */
  renderEditor?: (
    row: R,
    rowIndex: number,
    onChange: (next: string | number) => void,
  ) => React.ReactNode;
  /** Optional click hook (e.g. open an item picker for the first column). */
  onCellClick?: (row: R, rowIndex: number) => void;
  /** Filter row symbol shown in the column-header filter cell (=, ≤, *, ...). */
  filterSymbol?: string;
  align?: "left" | "right" | "center";
  className?: string;
  /** Placeholder shown in empty cells (e.g. "Tìm mã hoặc tên" for the SKU column). */
  placeholder?: string;
  /**
   * Optional footer cell in a sticky `<tfoot>` row aligned with this column.
   *
   * @deprecated Prefer the grid-level `footers` prop. Footers usually hold
   * running totals, and a total embedded here changes the identity of the
   * whole `columns` array on every edit, which defeats row memoization.
   */
  footer?: React.ReactNode;
}

export interface LineItemGridProps<R> {
  columns: LineColumn<R>[];
  rows: R[];
  onChangeCell?: (
    rowIndex: number,
    key: string,
    value: string | number,
  ) => void;
  onAddRow?: () => void;
  onDeleteRow?: (rowIndex: number) => void;
  /** Emits a filter map { [columnKey]: string } for header filters. */
  onFilterChange?: (filters: Record<string, string>) => void;
  filters?: Record<string, string>;
  /**
   * Sticky `<tfoot>` cells keyed by column key. Preferred over
   * `LineColumn.footer`: totals change on every edit, so keeping them out of
   * the column objects lets `columns` stay referentially stable and lets rows
   * bail out of re-rendering. Takes precedence over `LineColumn.footer`.
   */
  footers?: Record<string, React.ReactNode>;
  /**
   * Stable identity per row. Without it rows are keyed by index, so inserting
   * or deleting a line remounts every row below it (losing focus and any
   * in-cell dropdown state). Supply it for grids that hold many lines.
   */
  getRowKey?: (row: R, index: number) => string;
  className?: string;
  /** Show the trailing actions column (delete row). */
  showRowActions?: boolean;
  /** Enable the trailing "+" row to insert a new line. */
  showAddRow?: boolean;
  /** Empty-state placeholder text shown when rows is empty. */
  emptyText?: string;
  rowHeight?: number;
  /**
   * Row count above which only the visible window is rendered. Virtualization
   * additionally requires `getRowKey` — without stable keys React would recycle
   * a row's DOM and state onto a different line while scrolling.
   */
  virtualizeThreshold?: number;
}

function alignClass(a: LineColumn<unknown>["align"]) {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
}

/** Inline width/min-width style applied to every cell of a column (header + body). */
function sizeStyle(col: Pick<LineColumn<unknown>, "width" | "minWidth">): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (col.width != null) style.width = col.width;
  // Floor defaults to `width`: columns don't compress below their width, so the
  // grid scrolls horizontally instead of cramming. Set `minWidth` to override.
  const min = col.minWidth ?? col.width;
  if (min != null) style.minWidth = min;
  return style;
}

function buildHeaderGroups<R>(columns: LineColumn<R>[]) {
  const groups: Array<{
    key: string;
    label?: string;
    columns: LineColumn<R>[];
  }> = [];
  for (const col of columns) {
    const previous = groups[groups.length - 1];
    if (col.group && previous?.label === col.group) {
      previous.columns.push(col);
      continue;
    }
    groups.push({
      key: col.group ? `${col.group}-${groups.length}` : col.key,
      label: col.group,
      columns: [col],
    });
  }
  return groups;
}

const HEADER_ROW_HEIGHT = 32;
const DEFAULT_VIRTUALIZE_THRESHOLD = 60;
const VIRTUAL_OVERSCAN = 8;
const ROW_ACTIONS_WIDTH = 32;
const DEFAULT_COLUMN_WIDTH = 160;

/** Column widths must be resolvable to px for the fixed table layout below. */
function toPx(value: number | string | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

// Row striping is driven by rowIndex rather than the `odd:`/`even:` CSS
// variants: virtualization inserts spacer rows, which shifts nth-child parity.
// Module constants so the class string stays referentially stable for memo.
const ROW_STRIPE_EVEN = "bg-background hover:bg-accent/60";
const ROW_STRIPE_ODD = "bg-muted/15 hover:bg-accent/60";

interface LineItemRowProps<R> {
  row: R;
  rowIndex: number;
  /** Must be referentially stable, or the memo below never bails out. */
  columns: LineColumn<R>[];
  onChangeCell?: (
    rowIndex: number,
    key: string,
    value: string | number,
  ) => void;
  onDeleteRow?: (rowIndex: number) => void;
  showRowActions: boolean;
  rowHeight: number;
  className: string;
}

function LineItemRowInner<R>({
  row,
  rowIndex,
  columns,
  onChangeCell,
  onDeleteRow,
  showRowActions,
  rowHeight,
  className,
}: LineItemRowProps<R>) {
  return (
    <tr className={className} style={{ height: rowHeight }} data-row-index={rowIndex}>
      {columns.map((col) => {
        const raw = col.getValue
          ? col.getValue(row)
          : ((row as Record<string, unknown>)[col.key] as
              | string
              | number
              | undefined);
        const isReadonly = col.type === "readonly";
        return (
          <td
            key={col.key}
            className={cn(
              "border-r p-0",
              alignClass(col.align),
              col.className,
              col.onCellClick && "cursor-pointer",
            )}
            style={sizeStyle(col)}
            onClick={
              col.onCellClick
                ? () => col.onCellClick?.(row, rowIndex)
                : undefined
            }
          >
            {col.renderEditor ? (
              col.renderEditor(row, rowIndex, (v) =>
                onChangeCell?.(rowIndex, col.key, v),
              )
            ) : isReadonly ? (
              <span
                className="block truncate px-2 py-1.5 text-foreground"
                title={
                  typeof raw === "string" || typeof raw === "number"
                    ? String(raw)
                    : undefined
                }
              >
                {raw ?? ""}
              </span>
            ) : (
              <Input
                className={cn(
                  "h-8 w-full rounded-none border-0 bg-transparent px-2 text-sm shadow-none focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-inset",
                  alignClass(col.align),
                )}
                value={raw ?? ""}
                placeholder={col.placeholder}
                type={col.type === "number" ? "number" : "text"}
                onChange={(e) =>
                  onChangeCell?.(
                    rowIndex,
                    col.key,
                    col.type === "number"
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
                readOnly={!onChangeCell}
              />
            )}
          </td>
        );
      })}
      {showRowActions ? (
        <td className="w-8 border-r text-center">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDeleteRow?.(rowIndex)}
            aria-label="Xoá dòng"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      ) : null}
    </tr>
  );
}

/**
 * Editing one cell must not re-render the other N-1 rows. The default shallow
 * compare is exactly right here: callers update lines with
 * `prev.map((l, i) => (i === idx ? { ...l, … } : l))`, which preserves the
 * identity of every untouched row.
 *
 * `React.memo` erases the generic — the cast restores it.
 */
const LineItemRow = React.memo(LineItemRowInner) as typeof LineItemRowInner;

/**
 * Spreadsheet-style editor for document line items (Mã SKU, Tên hàng hóa,
 * Kho, Vị trí, Số lượng, Đơn giá, Thành tiền, ...). Supports per-column
 * inline filters in the header, inline editing, row delete, and add-row.
 *
 * Business-specific behaviors (item picker on cell click, auto-fill of
 * Vị trí by warehouse rule, etc.) are plugged in via column callbacks
 * — this component keeps no domain knowledge.
 *
 * Performance contract for large grids: pass a memoized `columns`, stable
 * `onChangeCell`/`onAddRow`/`onDeleteRow` callbacks, totals via `footers`
 * (not `column.footer`), and a `getRowKey`.
 */
function LineItemGridInner<R>({
  columns,
  rows,
  onChangeCell,
  onAddRow,
  onDeleteRow,
  onFilterChange,
  filters,
  footers,
  getRowKey,
  className,
  showRowActions = true,
  showAddRow = true,
  emptyText = "Tìm mã hoặc tên",
  rowHeight = 32,
  virtualizeThreshold = DEFAULT_VIRTUALIZE_THRESHOLD,
}: LineItemGridProps<R>) {
  const headerGroups = React.useMemo(
    () => buildHeaderGroups(columns),
    [columns],
  );
  const hasGroupedColumns = columns.some((col) => col.group);
  const filterRowTop = hasGroupedColumns
    ? HEADER_ROW_HEIGHT * 2
    : HEADER_ROW_HEIGHT;
  const colCount = columns.length + (showRowActions ? 1 : 0);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualized = rows.length > virtualizeThreshold && getRowKey != null;

  // The header rows live inside the same scroller, so the body starts this far
  // into the scroll range.
  const headerHeight =
    HEADER_ROW_HEIGHT * (hasGroupedColumns ? 3 : 2);

  const rowVirtualizer = useVirtualizer({
    // Hooks can't be conditional; a count of 0 keeps this inert when the grid
    // is small enough to render whole.
    count: virtualized ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUAL_OVERSCAN,
    scrollMargin: headerHeight,
    getItemKey: React.useCallback(
      (index: number) => getRowKey?.(rows[index], index) ?? index,
      [getRowKey, rows],
    ),
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const padTop = virtualItems.length
    ? virtualItems[0].start - headerHeight
    : 0;
  const padBottom = virtualItems.length
    ? rowVirtualizer.getTotalSize() -
      (virtualItems[virtualItems.length - 1].end - headerHeight)
    : 0;

  // With rows windowed, `table-layout: auto` would resize columns from whatever
  // slice happens to be mounted — widths would jitter on every scroll frame.
  // Pinning the layout moves the "scroll horizontally instead of cramming"
  // guarantee from per-cell min-width (ignored under a fixed layout) onto the
  // table itself.
  const fixedLayoutStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!virtualized) return undefined;
    let total = showRowActions ? ROW_ACTIONS_WIDTH : 0;
    for (const col of columns) {
      const px = toPx(col.minWidth ?? col.width);
      if (px == null) return undefined; // e.g. percentage widths — keep auto layout
      total += px;
    }
    return { tableLayout: "fixed", minWidth: total };
  }, [columns, showRowActions, virtualized]);

  // A focused cell that scrolls out of the window is unmounted; without this the
  // browser drops focus onto <body>. Values are safe either way — they live in
  // the caller's row state, not in the cell.
  const handleBlurCapture = React.useCallback(
    (event: React.FocusEvent<HTMLTableSectionElement>) => {
      if (!virtualized) return;
      if (event.relatedTarget) return;
      scrollRef.current?.focus({ preventScroll: true });
    },
    [virtualized],
  );

  const stickyHeaderStyle = (top: number): React.CSSProperties => ({
    position: "sticky",
    top,
    zIndex: 20,
  });

  const handleFilter = React.useCallback(
    (key: string, value: string) => {
      if (!onFilterChange) return;
      onFilterChange({ ...(filters ?? {}), [key]: value });
    },
    [onFilterChange, filters],
  );

  const footerFor = (col: LineColumn<R>) =>
    footers?.[col.key] ?? col.footer ?? null;
  const hasFooter =
    columns.some((col) => col.footer != null) ||
    (footers != null && Object.values(footers).some((v) => v != null));

  return (
    <div
      ref={scrollRef}
      tabIndex={-1}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-auto focus:outline-none",
        className,
      )}
    >
      <table
        className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_th]:border-b"
        style={fixedLayoutStyle}
      >
        <thead>
          <tr>
            {hasGroupedColumns
              ? headerGroups.map((group) =>
                  group.label ? (
                    <th
                      key={group.key}
                      colSpan={group.columns.length}
                      className="h-8 border-r bg-muted px-2 text-center text-sm font-semibold text-foreground"
                      style={stickyHeaderStyle(0)}
                    >
                      {group.label}
                    </th>
                  ) : (
                    <th
                      key={group.key}
                      rowSpan={2}
                      className={cn(
                        "h-16 border-r bg-muted px-2 text-center text-sm font-semibold text-foreground",
                        group.columns[0].className,
                      )}
                      style={{
                        ...stickyHeaderStyle(0),
                        ...sizeStyle(group.columns[0]),
                      }}
                    >
                      {group.columns[0].label}
                    </th>
                  ),
                )
              : columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "h-8 border-r bg-muted px-2 text-center text-sm font-semibold text-foreground",
                      col.className,
                    )}
                    style={{
                      ...stickyHeaderStyle(0),
                      ...sizeStyle(col),
                    }}
                  >
                    {col.label}
                  </th>
                ))}
            {showRowActions ? (
              <th
                className={cn(
                  "w-8 border-r bg-muted",
                  hasGroupedColumns ? "h-16" : "h-8",
                )}
                rowSpan={hasGroupedColumns ? 2 : 1}
                style={stickyHeaderStyle(0)}
              />
            ) : null}
          </tr>
          {hasGroupedColumns ? (
            <tr>
              {headerGroups.flatMap((group) =>
                group.label
                  ? group.columns.map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          "h-8 border-r bg-muted px-2 text-center text-sm font-semibold text-foreground",
                          col.className,
                        )}
                        style={{
                          ...stickyHeaderStyle(HEADER_ROW_HEIGHT),
                          ...sizeStyle(col),
                        }}
                      >
                        {col.label}
                      </th>
                    ))
                  : [],
              )}
            </tr>
          ) : null}
          {/* Header filter row */}
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="h-8 border-r bg-background p-0"
                style={{ ...stickyHeaderStyle(filterRowTop), ...sizeStyle(col) }}
              >
                <div className="flex h-8 min-w-0 items-stretch">
                  <span className="inline-flex w-7 shrink-0 items-center justify-center border-r bg-muted/30 font-mono text-xs font-semibold text-muted-foreground">
                    {col.filterSymbol ??
                      (col.type === "number" || col.align === "right" ? "≤" : "*")}
                  </span>
                  <Input
                    className="h-8 min-w-0 flex-1 rounded-none border-0 bg-background px-2 text-xs font-normal shadow-none focus-visible:ring-inset"
                    value={filters?.[col.key] ?? ""}
                    onChange={(e) => handleFilter(col.key, e.target.value)}
                    aria-label={`Lọc ${col.label}`}
                  />
                </div>
              </th>
            ))}
            {showRowActions ? (
              <th
                className="h-8 w-8 border-r bg-background"
                style={stickyHeaderStyle(filterRowTop)}
              />
            ) : null}
          </tr>
        </thead>
        <tbody onBlurCapture={handleBlurCapture}>
          {rows.length === 0 ? (
            <tr style={{ height: rowHeight }}>
              <td
                colSpan={colCount}
                className="px-2 py-1.5 text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          ) : virtualized ? (
            <>
              {padTop > 0 ? (
                <tr aria-hidden style={{ height: padTop }}>
                  <td colSpan={colCount} className="!border-b-0 p-0" />
                </tr>
              ) : null}
              {virtualItems.map((virtualRow) => (
                <LineItemRow
                  key={virtualRow.key}
                  row={rows[virtualRow.index]}
                  rowIndex={virtualRow.index}
                  columns={columns}
                  onChangeCell={onChangeCell}
                  onDeleteRow={onDeleteRow}
                  showRowActions={showRowActions}
                  rowHeight={rowHeight}
                  className={
                    virtualRow.index % 2 === 0
                      ? ROW_STRIPE_EVEN
                      : ROW_STRIPE_ODD
                  }
                />
              ))}
              {padBottom > 0 ? (
                <tr aria-hidden style={{ height: padBottom }}>
                  <td colSpan={colCount} className="!border-b-0 p-0" />
                </tr>
              ) : null}
            </>
          ) : (
            rows.map((row, rowIndex) => (
              <LineItemRow
                key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
                row={row}
                rowIndex={rowIndex}
                columns={columns}
                onChangeCell={onChangeCell}
                onDeleteRow={onDeleteRow}
                showRowActions={showRowActions}
                rowHeight={rowHeight}
                className={
                  rowIndex % 2 === 0 ? ROW_STRIPE_EVEN : ROW_STRIPE_ODD
                }
              />
            ))
          )}
          {showAddRow ? (
            <tr>
              <td colSpan={colCount} className="px-1 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-primary"
                  onClick={onAddRow}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm dòng
                </Button>
              </td>
            </tr>
          ) : null}
        </tbody>
        {hasFooter ? (
          <tfoot>
            <tr>
              {columns.map((col) => (
                <td
                  key={`${col.key}-footer`}
                  className={cn(
                    "h-8 border-t border-border bg-muted px-2 text-xs font-semibold",
                    alignClass(col.align),
                    col.className,
                  )}
                  style={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 10,
                    ...sizeStyle(col),
                  }}
                >
                  {footerFor(col)}
                </td>
              ))}
              {showRowActions ? (
                <td
                  className="border-t border-border bg-muted"
                  style={{ position: "sticky", bottom: 0, zIndex: 10 }}
                />
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/**
 * Memoized so an unrelated field elsewhere in a document form (Diễn giải,
 * Lý do, ...) re-renders the form without touching the grid. Requires the
 * caller to keep its props referentially stable — see the contract above.
 */
export const LineItemGrid = React.memo(
  LineItemGridInner,
) as typeof LineItemGridInner;
