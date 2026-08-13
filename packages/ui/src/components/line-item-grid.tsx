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
  /**
   * Emits a filter map { [columnKey]: string } for header filters.
   *
   * Passing it switches the header filters to **controlled** mode: the caller
   * owns the filter state and must narrow `rows` itself, and every `rowIndex`
   * the grid hands back (`onChangeCell`, `onDeleteRow`, `renderEditor`,
   * `onCellClick`) indexes into the already-filtered `rows` it passed.
   *
   * Omitting it leaves the filters **uncontrolled**: the grid keeps the filter
   * text and narrows the rows itself, and `rowIndex` stays the index into the
   * caller's full `rows` — so edits and deletes address the intended line
   * regardless of what is filtered out.
   */
  onFilterChange?: (filters: Record<string, string>) => void;
  filters?: Record<string, string>;
  /**
   * Sticky `<tfoot>` cells keyed by column key. Preferred over
   * `LineColumn.footer`: totals change on every edit, so keeping them out of
   * the column objects lets `columns` stay referentially stable and lets rows
   * bail out of re-rendering. Takes precedence over `LineColumn.footer`.
   *
   * Totals are document-wide: they come from the caller's own lines, so they
   * do not follow the header filters.
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
  /** Shown instead of `emptyText` when rows exist but none match the filters. */
  noMatchText?: string;
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

/** Symbol shown in a column's filter cell — it also selects the match rule. */
function filterSymbolFor(col: LineColumn<unknown>): string {
  return (
    col.filterSymbol ??
    (col.type === "number" || col.align === "right" ? "≤" : "*")
  );
}

/** Cell value exactly as the body cell resolves it (see LineItemRowInner). */
function cellValue<R>(col: LineColumn<R>, row: R): string | number | undefined {
  return col.getValue
    ? col.getValue(row)
    : ((row as Record<string, unknown>)[col.key] as
        | string
        | number
        | undefined);
}

/** vi-VN formatted number ("1.234,5") to a number, or null when unparseable. */
function parseVnNumber(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * One column's filter test. `≤` columns compare numerically (the symbol the
 * user sees is the rule that runs); everything else is a case-sensitive-free
 * substring match. Accents are significant, as everywhere else in the apps.
 */
function matchesColumnFilter<R>(
  col: LineColumn<R>,
  row: R,
  needle: string,
): boolean {
  const raw = cellValue(col, row);
  if (filterSymbolFor(col as LineColumn<unknown>) === "≤") {
    const limit = parseVnNumber(needle);
    // A half-typed limit ("-", "1,") must not blank the grid.
    if (limit == null) return true;
    const value = parseVnNumber(raw);
    return value != null && value <= limit;
  }
  return String(raw ?? "")
    .toLowerCase()
    .includes(needle.trim().toLowerCase());
}

/** Referentially stable empty map, so the filter memo can depend on it. */
const NO_FILTERS: Record<string, string> = {};

// Row striping is driven by rowIndex rather than the `odd:`/`even:` CSS
// variants: virtualization inserts spacer rows, which shifts nth-child parity.
// Module constants so the class string stays referentially stable for memo.
const ROW_STRIPE_EVEN = "bg-background hover:bg-accent/60";
const ROW_STRIPE_ODD = "bg-muted/15 hover:bg-accent/60";

interface LineItemRowProps<R> {
  row: R;
  /** Index in the grid's `rows`, which is what every caller callback expects. */
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
 * The header filters narrow the rows here unless the caller takes them over
 * with `onFilterChange` (see that prop). Editing a cell can push its own row
 * out of the filtered set as you type — that is inherent to filtering on a
 * value you are editing, and matches how the controlled callers behave.
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
  noMatchText = "Không tìm thấy dòng khớp bộ lọc",
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

  const uncontrolled = onFilterChange == null;
  // Seeded from `filters` so a caller that passes only the initial map (without
  // an onFilterChange) still starts on it instead of silently dropping it.
  const [internalFilters, setInternalFilters] = React.useState<
    Record<string, string>
  >(() => filters ?? NO_FILTERS);
  const activeFilters = uncontrolled ? internalFilters : (filters ?? NO_FILTERS);

  /**
   * The visible rows paired with their index in `rows`, or `null` when there is
   * nothing to narrow (controlled mode, or every filter blank). The sentinel
   * keeps the common path allocation-free: a 2000-line document would otherwise
   * build 2000 wrapper objects on every keystroke elsewhere in the form.
   */
  const entries = React.useMemo<{ row: R; sourceIndex: number }[] | null>(() => {
    if (!uncontrolled) return null;
    const active = Object.entries(activeFilters).filter(
      ([, value]) => value.trim() !== "",
    );
    if (active.length === 0) return null;
    const byKey = new Map(columns.map((col) => [col.key, col]));
    const applicable = active.flatMap(([key, value]) => {
      const col = byKey.get(key);
      if (!col) return [];
      // Columns whose key is synthetic (the value comes from a renderEditor,
      // not from the row) resolve `undefined` for every row — filtering on one
      // would empty the grid. Give them a `getValue` to make them filterable.
      const resolvable =
        col.getValue != null ||
        rows.some((row) => row != null && col.key in (row as object));
      return resolvable ? [[col, value] as const] : [];
    });
    if (applicable.length === 0) return null;
    const result: { row: R; sourceIndex: number }[] = [];
    rows.forEach((row, sourceIndex) => {
      if (applicable.every(([col, value]) => matchesColumnFilter(col, row, value)))
        result.push({ row, sourceIndex });
    });
    return result;
  }, [uncontrolled, activeFilters, rows, columns]);

  const visibleCount = entries ? entries.length : rows.length;
  const rowAt = (index: number) =>
    entries ? entries[index].row : rows[index];
  const sourceIndexAt = (index: number) =>
    entries ? entries[index].sourceIndex : index;

  // Keyed on the document size, not the filtered count: flipping virtualization
  // off mid-filter would drop `fixedLayoutStyle` and jump every column width.
  const virtualized = rows.length > virtualizeThreshold && getRowKey != null;

  // The header rows live inside the same scroller, so the body starts this far
  // into the scroll range.
  const headerHeight =
    HEADER_ROW_HEIGHT * (hasGroupedColumns ? 3 : 2);

  const rowVirtualizer = useVirtualizer({
    // Hooks can't be conditional; a count of 0 keeps this inert when the grid
    // is small enough to render whole.
    count: virtualized ? visibleCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: VIRTUAL_OVERSCAN,
    scrollMargin: headerHeight,
    // Must resolve through the visible set: keying window position `i` by
    // `rows[i]` while the count is the filtered one recycles a row's DOM onto a
    // different line.
    getItemKey: React.useCallback(
      (index: number) => {
        const row = entries ? entries[index]?.row : rows[index];
        const sourceIndex = entries
          ? (entries[index]?.sourceIndex ?? index)
          : index;
        return row === undefined
          ? sourceIndex
          : (getRowKey?.(row, sourceIndex) ?? sourceIndex);
      },
      [getRowKey, rows, entries],
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
      if (onFilterChange) {
        onFilterChange({ ...(filters ?? {}), [key]: value });
        return;
      }
      setInternalFilters((prev) => ({ ...prev, [key]: value }));
      // The list shrinks under the scroll position otherwise, and the browser
      // clamps it a frame later — a visible jump on every keystroke.
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [onFilterChange, filters],
  );

  const hasActiveFilter = Object.values(activeFilters).some(
    (value) => value.trim() !== "",
  );

  // A new line appended while a filter is active would be filtered straight
  // back out, so the button would look dead and the user would click again.
  const handleAddRow = React.useCallback(() => {
    if (uncontrolled && hasActiveFilter) setInternalFilters(NO_FILTERS);
    onAddRow?.();
  }, [uncontrolled, hasActiveFilter, onAddRow]);

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
                    {filterSymbolFor(col as LineColumn<unknown>)}
                  </span>
                  <Input
                    className="h-8 min-w-0 flex-1 rounded-none border-0 bg-background px-2 text-xs font-normal shadow-none focus-visible:ring-inset"
                    value={activeFilters[col.key] ?? ""}
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
          {visibleCount === 0 ? (
            <tr style={{ height: rowHeight }}>
              <td
                colSpan={colCount}
                className="px-2 py-1.5 text-muted-foreground"
              >
                {rows.length === 0 ? emptyText : noMatchText}
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
                  row={rowAt(virtualRow.index)}
                  rowIndex={sourceIndexAt(virtualRow.index)}
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
            (entries ?? rows.map((row, sourceIndex) => ({ row, sourceIndex }))).map(
              ({ row, sourceIndex }, visibleIndex) => (
                <LineItemRow
                  key={getRowKey ? getRowKey(row, sourceIndex) : sourceIndex}
                  row={row}
                  rowIndex={sourceIndex}
                  columns={columns}
                  onChangeCell={onChangeCell}
                  onDeleteRow={onDeleteRow}
                  showRowActions={showRowActions}
                  rowHeight={rowHeight}
                  // Striping follows what the eye sees, not the source line.
                  className={
                    visibleIndex % 2 === 0 ? ROW_STRIPE_EVEN : ROW_STRIPE_ODD
                  }
                />
              ),
            )
          )}
          {showAddRow ? (
            <tr>
              <td colSpan={colCount} className="px-1 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-primary"
                  onClick={handleAddRow}
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
