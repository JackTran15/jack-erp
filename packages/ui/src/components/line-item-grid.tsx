import * as React from "react";
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
  /** Optional footer cell in a sticky `<tfoot>` row aligned with this column. */
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
  className?: string;
  /** Show the trailing actions column (delete row). */
  showRowActions?: boolean;
  /** Enable the trailing "+" row to insert a new line. */
  showAddRow?: boolean;
  /** Empty-state placeholder text shown when rows is empty. */
  emptyText?: string;
  rowHeight?: number;
}

function alignClass(a: LineColumn<unknown>["align"]) {
  if (a === "right") return "text-right";
  if (a === "center") return "text-center";
  return "text-left";
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

/**
 * Spreadsheet-style editor for document line items (Mã SKU, Tên hàng hóa,
 * Kho, Vị trí, Số lượng, Đơn giá, Thành tiền, ...). Supports per-column
 * inline filters in the header, inline editing, row delete, and add-row.
 *
 * Business-specific behaviors (item picker on cell click, auto-fill of
 * Vị trí by warehouse rule, etc.) are plugged in via column callbacks
 * — this component keeps no domain knowledge.
 */
export function LineItemGrid<R>({
  columns,
  rows,
  onChangeCell,
  onAddRow,
  onDeleteRow,
  onFilterChange,
  filters,
  className,
  showRowActions = true,
  showAddRow = true,
  emptyText = "Tìm mã hoặc tên",
  rowHeight = 32,
}: LineItemGridProps<R>) {
  const headerGroups = React.useMemo(
    () => buildHeaderGroups(columns),
    [columns],
  );
  const hasGroupedColumns = columns.some((col) => col.group);
  const filterRowTop = hasGroupedColumns
    ? HEADER_ROW_HEIGHT * 2
    : HEADER_ROW_HEIGHT;
  const stickyHeaderStyle = (top: number): React.CSSProperties => ({
    position: "sticky",
    top,
    zIndex: 20,
  });

  const handleFilter = (key: string, value: string) => {
    if (!onFilterChange) return;
    onFilterChange({ ...(filters ?? {}), [key]: value });
  };

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col overflow-auto", className)}
    >
      <table className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_th]:border-b">
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
                      style={
                        {
                          ...stickyHeaderStyle(0),
                          ...(group.columns[0].width
                            ? { width: group.columns[0].width }
                            : {}),
                        }
                      }
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
                      ...(col.width ? { width: col.width } : {}),
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
                          ...(col.width ? { width: col.width } : {}),
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
                style={stickyHeaderStyle(filterRowTop)}
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
        <tbody>
          {rows.length === 0 ? (
            <tr style={{ height: rowHeight }}>
              <td
                colSpan={columns.length + (showRowActions ? 1 : 0)}
                className="px-2 py-1.5 text-muted-foreground"
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="odd:bg-background even:bg-muted/15 hover:bg-blue-50/60"
                style={{ height: rowHeight }}
              >
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
            ))
          )}
          {showAddRow ? (
            <tr>
              <td
                colSpan={columns.length + (showRowActions ? 1 : 0)}
                className="px-1 py-1"
              >
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
        {columns.some((c) => c.footer != null) ? (
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
                    ...(col.width ? { width: col.width } : {}),
                  }}
                >
                  {col.footer ?? null}
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
