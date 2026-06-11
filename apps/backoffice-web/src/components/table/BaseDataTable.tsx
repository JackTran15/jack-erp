import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn, Input } from "@erp/ui";
import type {
  ColumnCompareOp,
  ColumnFilter,
  ColumnFilterMode,
} from "./pagination.dto";
import {
  DEFAULT_COLUMN_COMPARE_OP,
  DEFAULT_COLUMN_FILTER_MODE,
} from "./pagination.dto";
import {
  ColumnCompareOpDropdown,
  ColumnFilterModeDropdown,
} from "./ColumnFilterModeControl";

export type ColumnFilterKind =
  | "symbol"
  | "select"
  | "date"
  | "time"
  | "date-range"
  | "date-compare"
  | "number-range"
  | "none";

export interface ColumnFilterSelectOption {
  value: string;
  label: string;
}

export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  width?: number | string;
  sortable?: boolean;
  /**
   * - "symbol" (default): operator chip (*, =, +, -, !) + free text input
   * - "select": dropdown of predefined values (provide `filterOptions`)
   * - "none": render an empty filter cell (column is non-filterable)
   */
  filterKind?: ColumnFilterKind;
  filterOptions?: ColumnFilterSelectOption[];
  filterPlaceholder?: string;
  /**
   * When set, consecutive columns with the same `group` label are rendered
   * under a shared parent header cell (2-row header). Columns without a
   * group rowSpan across both header rows.
   */
  group?: string;
  /**
   * Pin this column on the left during horizontal scroll. Width must be a
   * fixed numeric value for cumulative left-offset calculation to work.
   */
  frozen?: boolean;
  /**
   * Optional footer cell rendered in a sticky `<tfoot>` row aligned with this
   * column. The shell can compute these per-column (e.g. column totals) and
   * they automatically follow column reordering / visibility.
   */
  footer?: React.ReactNode;
}

interface LeadingColumn<T> {
  width?: number | string;
  header: React.ReactNode;
  filterHeader?: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

interface ColumnFilterControl {
  filters: Record<string, ColumnFilter>;
  onModeChange: (fieldKey: string, mode: ColumnFilterMode) => void;
  onValueChange: (fieldKey: string, value: string) => void;
  /** Required for columns with `filterKind: "date-range"`. */
  onRangeChange?: (fieldKey: string, part: "from" | "to", value: string) => void;
  /** Required for columns with `filterKind: "date-compare"`. */
  onCompareOpChange?: (fieldKey: string, op: ColumnCompareOp) => void;
}

interface BaseDataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  loading: boolean;
  emptyLabel: string;
  actionsLabel?: string;
  renderActions?: (row: T) => React.ReactNode;
  getRowKey: (row: T, index: number) => string;
  className?: string;
  scrollContainerClassName?: string;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  leadingColumn?: LeadingColumn<T>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  columnFilterControl?: ColumnFilterControl;
  footer?: React.ReactNode;
  /**
   * Called when the user finishes resizing a column. Caller is expected to
   * persist the new width back into its column model.
   */
  onColumnResize?: (key: string, nextWidth: number) => void;
}

interface ColumnGroupSpan {
  group: string | null;
  startIndex: number;
  span: number;
}

function computeGroupSpans<T>(columns: TableColumn<T>[]): ColumnGroupSpan[] {
  const out: ColumnGroupSpan[] = [];
  let i = 0;
  while (i < columns.length) {
    const g = columns[i]!.group ?? null;
    let j = i + 1;
    if (g) {
      while (j < columns.length && columns[j]!.group === g) j += 1;
    }
    out.push({ group: g, startIndex: i, span: j - i });
    i = j;
  }
  return out;
}

function computeFrozenOffsets<T>(
  columns: TableColumn<T>[],
  leadingWidth: number,
): { offsets: Map<string, number>; lastFrozenKey: string | null } {
  const offsets = new Map<string, number>();
  let acc = leadingWidth;
  let lastFrozenKey: string | null = null;
  for (const col of columns) {
    if (col.frozen) {
      offsets.set(col.key, acc);
      const w = typeof col.width === "number" ? col.width : 0;
      acc += w;
      lastFrozenKey = col.key;
    }
  }
  return { offsets, lastFrozenKey };
}

const FROZEN_BG = "bg-background";
const HEADER_ROW_HEIGHT = 32;
/** Box-shadow used to draw a clean right edge on the rightmost frozen column. */
const FROZEN_EDGE_SHADOW = "1px 0 0 0 hsl(var(--border))";

const frozenBodyBackground = (striped: boolean): string =>
  striped
    ? "color-mix(in srgb, hsl(var(--muted)) 20%, hsl(var(--background)))"
    : "hsl(var(--background))";

export function BaseDataTable<T>({
  columns,
  rows,
  loading,
  emptyLabel,
  actionsLabel = "Thao tác",
  renderActions,
  getRowKey,
  className,
  scrollContainerClassName,
  onRowClick,
  onRowDoubleClick,
  leadingColumn,
  sortBy,
  sortOrder = "desc",
  onSort,
  columnFilterControl,
  footer,
  onColumnResize,
}: BaseDataTableProps<T>) {
  const colSpan = columns.length + (renderActions ? 1 : 0) + (leadingColumn ? 1 : 0);
  const colRefs = React.useRef<Map<string, HTMLTableColElement>>(new Map());
  // Internal width state — used when the consumer doesn't pass `onColumnResize`,
  // so resize is always available even without parent persistence.
  const [internalWidths, setInternalWidths] = React.useState<Record<string, number>>({});

  const beginResize = (
    key: string,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const colEl = colRefs.current.get(key);
    if (!colEl) return;
    const startX = e.clientX;
    const startWidth = colEl.getBoundingClientRect().width;
    let lastWidth = startWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(60, startWidth + (ev.clientX - startX));
      lastWidth = next;
      colEl.style.width = `${next}px`;
      colEl.style.minWidth = `${next}px`;
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const next = Math.round(lastWidth);
      if (onColumnResize) onColumnResize(key, next);
      else setInternalWidths((prev) => ({ ...prev, [key]: next }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  /**
   * Group header resize: drag the right edge of a parent group header to
   * scale all child columns proportionally. Each child's new width is
   * `start * (newTotal / oldTotal)`, with a 60px floor per column. The
   * leftover from rounding is folded into the last child so the sum lands
   * exactly on `newTotal`.
   */
  const beginGroupResize = (
    keys: string[],
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startWidths: number[] = keys.map((k) => {
      const el = colRefs.current.get(k);
      return el ? el.getBoundingClientRect().width : 0;
    });
    const startTotal = startWidths.reduce((s, w) => s + w, 0);
    if (startTotal === 0) return;
    const startX = e.clientX;
    let lastWidths = [...startWidths];
    const minPer = 60;
    const minTotal = minPer * keys.length;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      const nextTotal = Math.max(minTotal, startTotal + (ev.clientX - startX));
      const scale = nextTotal / startTotal;
      const computed = startWidths.map((w) => Math.max(minPer, Math.round(w * scale)));
      const drift = nextTotal - computed.reduce((s, w) => s + w, 0);
      computed[computed.length - 1] = Math.max(
        minPer,
        (computed[computed.length - 1] ?? minPer) + drift,
      );
      lastWidths = computed;
      keys.forEach((k, i) => {
        const el = colRefs.current.get(k);
        if (!el) return;
        const w = computed[i]!;
        el.style.width = `${w}px`;
        el.style.minWidth = `${w}px`;
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const updates: Record<string, number> = {};
      keys.forEach((k, i) => {
        const w = lastWidths[i];
        if (w === undefined) return;
        const rounded = Math.round(w);
        if (onColumnResize) onColumnResize(k, rounded);
        else updates[k] = rounded;
      });
      if (!onColumnResize && Object.keys(updates).length > 0) {
        setInternalWidths((prev) => ({ ...prev, ...updates }));
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const groupSpans = computeGroupSpans(columns);
  const hasGroups = groupSpans.some((g) => g.group);
  const leadingWidth = typeof leadingColumn?.width === "number" ? leadingColumn.width : 0;
  const { offsets: frozenOffsets, lastFrozenKey } = computeFrozenOffsets(columns, leadingWidth);
  // Pixel offsets for the compact sticky header rows.
  const TOP_TITLE = 0;
  const TOP_SUB = hasGroups ? HEADER_ROW_HEIGHT : 0;
  const TOP_FILTER = hasGroups ? HEADER_ROW_HEIGHT * 2 : HEADER_ROW_HEIGHT;

  const frozenStyle = (col: TableColumn<T>): React.CSSProperties | undefined => {
    if (!col.frozen) return undefined;
    const left = frozenOffsets.get(col.key);
    if (left === undefined) return undefined;
    const base: React.CSSProperties = { position: "sticky", left };
    if (col.key === lastFrozenKey) base.boxShadow = FROZEN_EDGE_SHADOW;
    return base;
  };

  return (
    <div className={cn("isolate flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-background", className)}>
      <div className={cn("min-h-0 flex-1 overflow-auto", scrollContainerClassName)}>
        <table className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_td]:border-r [&_td]:border-border [&_th]:border-b [&_th]:border-r [&_th]:border-border">
          <colgroup>
            {leadingColumn ? <col style={leadingColumn.width ? { width: leadingColumn.width, minWidth: leadingColumn.width } : undefined} /> : null}
            {columns.map((column) => {
              const overridden = internalWidths[column.key];
              const w = overridden ?? column.width;
              return (
                <col
                  key={`col-${column.key}`}
                  ref={(el) => {
                    if (el) colRefs.current.set(column.key, el);
                    else colRefs.current.delete(column.key);
                  }}
                  style={w ? { width: w, minWidth: w } : undefined}
                />
              );
            })}
            {renderActions ? <col style={{ width: 180, minWidth: 180 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {leadingColumn ? (
                <th
                  rowSpan={hasGroups ? 2 : 1}
                  className={cn(
                    "sticky top-0 h-8 bg-muted px-1 py-0 text-center",
                    leadingColumn.headerClassName,
                  )}
                  style={{ top: TOP_TITLE, zIndex: 25 }}
                >
                  {leadingColumn.header}
                </th>
              ) : null}
              {groupSpans.map((g) => {
                if (!g.group) {
                  const col = columns[g.startIndex]!;
                  return (
                    <SortableHeader
                      key={col.key}
                      column={col}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={onSort}
                      rowSpan={hasGroups ? 2 : 1}
                      top={TOP_TITLE}
                      stickyStyle={frozenStyle(col)}
                      stickyZ={col.frozen ? 35 : 25}
                      onResizeStart={(e) => beginResize(col.key, e)}
                    />
                  );
                }
                const groupKeys = columns
                  .slice(g.startIndex, g.startIndex + g.span)
                  .map((c) => c.key);
                return (
                  <th
                    key={`grp-${g.startIndex}`}
                    colSpan={g.span}
                    className="group sticky h-8 bg-muted px-2 py-0 text-center text-sm font-semibold relative"
                    style={{ top: TOP_TITLE, zIndex: 25 }}
                  >
                    {g.group}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${g.group}`}
                      onPointerDown={(e) => beginGroupResize(groupKeys, e)}
                      className="group/resizer absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none touch-none"
                    >
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-primary opacity-0 transition-opacity group-hover/resizer:opacity-100" />
                    </div>
                  </th>
                );
              })}
              {renderActions ? (
                <th
                  rowSpan={hasGroups ? 2 : 1}
                  className="sticky top-0 h-8 bg-muted px-2 py-0 text-center text-sm font-semibold whitespace-nowrap"
                  style={{ top: TOP_TITLE, zIndex: 25 }}
                >
                  {actionsLabel}
                </th>
              ) : null}
            </tr>
            {hasGroups ? (
              <tr>
                {groupSpans.map((g) =>
                  g.group
                    ? columns.slice(g.startIndex, g.startIndex + g.span).map((col) => (
                        <SortableHeader
                          key={col.key}
                          column={col}
                          sortBy={sortBy}
                          sortOrder={sortOrder}
                          onSort={onSort}
                          top={TOP_SUB}
                          stickyStyle={frozenStyle(col)}
                          stickyZ={col.frozen ? 34 : 24}
                          onResizeStart={(e) => beginResize(col.key, e)}
                        />
                      ))
                    : null,
                )}
              </tr>
            ) : null}
            {columnFilterControl ? (
              <tr>
                {leadingColumn ? (
                  <th
                    className="sticky z-20 h-8 bg-background p-0 text-left text-xs text-muted-foreground"
                    style={{ top: TOP_FILTER }}
                  >
                    {leadingColumn.filterHeader}
                  </th>
                ) : null}
                {columns.map((column) => {
                  const activeFilter = columnFilterControl.filters[column.key];
                  const kind: ColumnFilterKind = column.filterKind ?? "symbol";
                  const fStyle = frozenStyle(column);
                  return (
                    <th
                      key={`${column.key}-filter`}
                      className={cn(
                        "z-20 h-8 bg-background p-0 align-middle",
                        column.headerClassName,
                        column.frozen && FROZEN_BG,
                      )}
                      style={{
                        position: "sticky",
                        top: TOP_FILTER,
                        ...(fStyle ?? {}),
                        zIndex: column.frozen ? 30 : 20,
                      }}
                    >
                      {kind === "none" ? null : kind === "select" ? (
                        <select
                          className="h-8 w-full min-w-0 border-0 bg-background px-2 text-xs font-normal outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                          value={activeFilter?.value ?? ""}
                          onChange={(event) => {
                            // Select filters always use exact-match semantics.
                            columnFilterControl.onModeChange(column.key, "equals");
                            columnFilterControl.onValueChange(column.key, event.target.value);
                          }}
                          aria-label={`Lọc ${column.label}`}
                        >
                          <option value="">
                            {column.filterPlaceholder ?? "— Tất cả —"}
                          </option>
                          {(column.filterOptions ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : kind === "date" || kind === "time" ? (
                        <div className="flex h-8 min-w-0 items-stretch">
                          <span className="inline-flex w-7 shrink-0 items-center justify-center border-r bg-muted/30 text-xs font-semibold text-muted-foreground">=</span>
                          <input
                            type={kind}
                            className="h-8 min-w-0 flex-1 border-0 bg-background px-2 text-xs font-normal outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                            value={activeFilter?.value ?? ""}
                            onChange={(event) => {
                              columnFilterControl.onModeChange(column.key, "equals");
                              columnFilterControl.onValueChange(column.key, event.target.value);
                            }}
                            aria-label={`Lọc ${column.label}`}
                          />
                        </div>
                      ) : kind === "date-range" ? (
                        <div className="flex h-8 min-w-0 items-stretch">
                          <input
                            type="date"
                            className="h-8 min-w-0 flex-1 border-0 bg-background px-1 text-xs font-normal outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                            value={activeFilter?.from ?? ""}
                            onChange={(event) =>
                              columnFilterControl.onRangeChange?.(
                                column.key,
                                "from",
                                event.target.value,
                              )
                            }
                            aria-label={`Lọc ${column.label} từ ngày`}
                          />
                          <span className="inline-flex items-center border-x bg-muted/30 px-1 text-xs text-muted-foreground">–</span>
                          <input
                            type="date"
                            className="h-8 min-w-0 flex-1 border-0 bg-background px-1 text-xs font-normal outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                            value={activeFilter?.to ?? ""}
                            onChange={(event) =>
                              columnFilterControl.onRangeChange?.(
                                column.key,
                                "to",
                                event.target.value,
                              )
                            }
                            aria-label={`Lọc ${column.label} đến ngày`}
                          />
                        </div>
                      ) : kind === "date-compare" ? (
                        <div className="flex items-center gap-1">
                          <ColumnCompareOpDropdown
                            fieldLabel={column.label}
                            value={activeFilter?.compareOp ?? DEFAULT_COLUMN_COMPARE_OP}
                            onChange={(op) =>
                              columnFilterControl.onCompareOpChange?.(column.key, op)
                            }
                          />
                          <input
                            type="date"
                            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-xs font-normal"
                            value={activeFilter?.value ?? ""}
                            onChange={(event) =>
                              columnFilterControl.onValueChange(column.key, event.target.value)
                            }
                            aria-label={`Lọc ${column.label}`}
                          />
                        </div>
                      ) : kind === "number-range" ? (
                        <div className="flex h-8 min-w-0 items-stretch">
                          <span className="inline-flex w-7 shrink-0 items-center justify-center border-r bg-muted/30 text-xs font-semibold text-muted-foreground">≤</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="h-8 min-w-0 flex-1 border-0 bg-background px-2 text-xs font-normal outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500"
                            placeholder="Giá trị..."
                            value={activeFilter?.value ?? ""}
                            onChange={(event) =>
                              columnFilterControl.onValueChange(column.key, event.target.value)
                            }
                            aria-label={`Lọc ${column.label}`}
                          />
                        </div>
                      ) : (
                        <div className="flex h-8 min-w-0 items-stretch">
                          <ColumnFilterModeDropdown
                            fieldLabel={column.label}
                            value={activeFilter?.mode ?? DEFAULT_COLUMN_FILTER_MODE}
                            onChange={(mode) => columnFilterControl.onModeChange(column.key, mode)}
                            triggerClassName="h-8 w-7 rounded-none border-0 border-r shadow-none"
                          />
                          <Input
                            className="h-8 min-w-0 flex-1 rounded-none border-0 px-2 text-xs font-normal shadow-none focus-visible:ring-inset"
                            placeholder="Giá trị..."
                            value={activeFilter?.value ?? ""}
                            onChange={(event) => columnFilterControl.onValueChange(column.key, event.target.value)}
                          />
                        </div>
                      )}
                    </th>
                  );
                })}
                {renderActions ? (
                  <th
                    className="z-20 h-8 bg-background p-0"
                    style={{ position: "sticky", top: TOP_FILTER }}
                  />
                ) : null}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={colSpan}>
                  Đang tải…
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={colSpan}>
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
            {!loading
              ? rows.map((row, index) => (
                <tr
                  key={getRowKey(row, index)}
                  className={cn(
                    index % 2 === 0 ? "bg-background" : "bg-muted/20",
                    onRowClick || onRowDoubleClick ? "cursor-pointer hover:bg-blue-50/70" : null,
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                >
                  {leadingColumn ? (
                    <td className={cn("h-8 px-1 py-0 text-center align-middle", leadingColumn.cellClassName)}>
                      {leadingColumn.cell(row, index)}
                    </td>
                  ) : null}
                  {columns.map((column) => {
                    const fStyle = frozenStyle(column);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "h-8 max-w-0 truncate px-2 py-0 align-middle",
                          column.className,
                          column.frozen && FROZEN_BG,
                        )}
                        style={
                          fStyle
                            ? {
                                ...fStyle,
                                zIndex: 5,
                                backgroundColor: frozenBodyBackground(index % 2 !== 0),
                              }
                            : undefined
                        }
                      >
                        {column.render(row)}
                      </td>
                    );
                  })}
                  {renderActions ? (
                    <td className="h-8 px-2 py-0 align-middle">{renderActions(row)}</td>
                  ) : null}
                </tr>
              ))
              : null}
          </tbody>
          {columns.some((c) => c.footer != null) ? (
            <tfoot>
              <tr>
                {leadingColumn ? (
                  <td
                    className="border-t border-border bg-muted px-2 py-2"
                    style={{ position: "sticky", bottom: 0, zIndex: 5 }}
                  />
                ) : null}
                {columns.map((column) => {
                  const fStyle = frozenStyle(column);
                  return (
                    <td
                      key={`${column.key}-footer`}
                      className={cn(
                        "h-8 border-t border-border bg-muted px-2 py-0 text-xs font-semibold",
                        column.className,
                        column.frozen && FROZEN_BG,
                      )}
                      style={{
                        position: "sticky",
                        bottom: 0,
                        ...(fStyle ?? {}),
                        zIndex: column.frozen ? 7 : 5,
                      }}
                    >
                      {column.footer ?? null}
                    </td>
                  );
                })}
                {renderActions ? (
                  <td
                    className="border-t border-border bg-muted px-3 py-2"
                    style={{ position: "sticky", bottom: 0, zIndex: 5 }}
                  />
                ) : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}

function SortableHeader<T>({
  column,
  sortBy,
  sortOrder,
  onSort,
  rowSpan,
  top = 0,
  stickyStyle,
  stickyZ = 20,
  onResizeStart,
}: {
  column: TableColumn<T>;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  rowSpan?: number;
  top?: number;
  stickyStyle?: React.CSSProperties;
  stickyZ?: number;
  onResizeStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const isSortable = Boolean(onSort) && column.sortable !== false;
  const active = sortBy === column.key;
  const buttonClassName = isSortable ? "cursor-pointer select-none" : "";

  return (
    <th
      rowSpan={rowSpan}
      className={cn(
        "group relative h-8 bg-muted px-2 py-0 text-center text-sm font-semibold whitespace-nowrap",
        column.frozen && "bg-muted",
        column.headerClassName,
      )}
      style={{
        position: "sticky",
        top,
        ...(stickyStyle ?? {}),
        zIndex: stickyZ,
      }}
      aria-sort={active ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
      onClick={isSortable ? () => onSort?.(column.key) : undefined}
    >
      <span className={cn("inline-flex items-center gap-1.5", buttonClassName)}>
        {column.label}
        {active ? (
          sortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : null}
      </span>
      {onResizeStart ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column.label}`}
          onPointerDown={onResizeStart}
          className="group/resizer absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize select-none touch-none"
        >
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-primary opacity-0 transition-opacity group-hover/resizer:opacity-100" />
        </div>
      ) : null}
    </th>
  );
}
