import type React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn, Input } from "@erp/ui";
import type { ColumnFilter, ColumnFilterMode } from "./pagination.dto";
import { DEFAULT_COLUMN_FILTER_MODE } from "./pagination.dto";
import { ColumnFilterModeDropdown } from "./ColumnFilterModeControl";

export type ColumnFilterKind = "symbol" | "select" | "none";

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
  leadingColumn?: LeadingColumn<T>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (columnKey: string) => void;
  columnFilterControl?: ColumnFilterControl;
  footer?: React.ReactNode;
}

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
  leadingColumn,
  sortBy,
  sortOrder = "desc",
  onSort,
  columnFilterControl,
  footer,
}: BaseDataTableProps<T>) {
  const colSpan = columns.length + (renderActions ? 1 : 0) + (leadingColumn ? 1 : 0);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background", className)}>
      <div className={cn("min-h-0 flex-1 overflow-auto", scrollContainerClassName)}>
        <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-border [&_th]:border [&_th]:border-border">
          <colgroup>
            {leadingColumn ? <col style={leadingColumn.width ? { width: leadingColumn.width, minWidth: leadingColumn.width } : undefined} /> : null}
            {columns.map((column) => (
              <col key={`col-${column.key}`} style={column.width ? { width: column.width, minWidth: column.width } : undefined} />
            ))}
            {renderActions ? <col style={{ width: 180, minWidth: 180 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {leadingColumn ? (
                <th className={cn("sticky top-0 z-20 h-10 border-b border-border bg-background px-2 py-0 text-center", leadingColumn.headerClassName)}>
                  {leadingColumn.header}
                </th>
              ) : null}
              {columns.map((column) => (
                <SortableHeader
                  key={column.key}
                  column={column}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
              ))}
              {renderActions ? (
                <th className="sticky top-0 z-20 h-10 border-b border-border bg-background px-3 py-0 text-left text-sm font-semibold whitespace-nowrap">
                  {actionsLabel}
                </th>
              ) : null}
            </tr>
            {columnFilterControl ? (
              <tr>
                {leadingColumn ? (
                  <th className="sticky top-10 z-20 h-10 border-b border-border bg-background px-2 py-0 text-left text-xs text-muted-foreground shadow-[0_1px_0_0_rgb(0_0_0_/_0.04)]">
                    {leadingColumn.filterHeader}
                  </th>
                ) : null}
                {columns.map((column) => {
                  const activeFilter = columnFilterControl.filters[column.key];
                  const kind: ColumnFilterKind = column.filterKind ?? "symbol";
                  return (
                    <th
                      key={`${column.key}-filter`}
                      className={cn(
                        "sticky top-10 z-20 h-10 border-b border-border bg-background px-2 py-0 align-middle shadow-[0_1px_0_0_rgb(0_0_0_/_0.04)]",
                        column.headerClassName,
                      )}
                    >
                      {kind === "none" ? null : kind === "select" ? (
                        <select
                          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs font-normal"
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
                      ) : (
                        <div className="flex items-center gap-1">
                          <ColumnFilterModeDropdown
                            fieldLabel={column.label}
                            value={activeFilter?.mode ?? DEFAULT_COLUMN_FILTER_MODE}
                            onChange={(mode) => columnFilterControl.onModeChange(column.key, mode)}
                          />
                          <Input
                            className="h-8 min-w-0 flex-1 text-xs font-normal"
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
                  <th className="sticky top-12 z-20 border-b border-border bg-white px-2 py-1" />
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
                    "border-b border-border",
                    onRowClick ? "cursor-pointer hover:bg-accent/20" : null,
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {leadingColumn ? (
                    <td className={cn("px-2 py-2.5 text-center align-middle", leadingColumn.cellClassName)}>
                      {leadingColumn.cell(row, index)}
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-3 py-2.5 align-middle", column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                  {renderActions ? (
                    <td className="px-3 py-2.5 align-middle">{renderActions(row)}</td>
                  ) : null}
                </tr>
              ))
              : null}
          </tbody>
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
}: {
  column: TableColumn<T>;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  onSort?: (columnKey: string) => void;
}) {
  const isSortable = Boolean(onSort) && column.sortable !== false;
  const active = sortBy === column.key;
  const buttonClassName = isSortable ? "cursor-pointer select-none" : "";

  return (
    <th
      className={cn(
        "sticky top-0 z-20 h-10 border-b border-border bg-background px-3 py-0 text-left text-sm font-semibold whitespace-nowrap",
        column.headerClassName,
      )}
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
    </th>
  );
}

