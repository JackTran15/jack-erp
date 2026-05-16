import { cn } from "@erp/ui";
import type { ReactNode } from "react";

export type PosDataTableAlign = "left" | "right";

export interface PosDataTableColumn<TData> {
  key: string;
  title: ReactNode;
  align?: PosDataTableAlign;
  render: (row: TData) => ReactNode;
  /** Optional cell rendered in the secondary header row (filter strip). */
  filterRender?: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface PosDataTableProps<TData> {
  columns: ReadonlyArray<PosDataTableColumn<TData>>;
  dataSource: ReadonlyArray<TData>;
  rowKey: (row: TData) => string;
  emptyText: string;
  /** Optional `<tfoot>` content (e.g. grand-total summary row). */
  summaryRow?: ReactNode;
  rowClassName?: (row: TData) => string | undefined;
  hasBorder?: boolean;
  /** Stretch table to its container so summary rows can sit at the bottom. */
  fillHeight?: boolean;
}

/**
 * App-shared, presentational column-driven data table. Pagination and filter
 * state are NOT owned here — parents thread them through `filterRender` cells
 * and wrap the table with a separate `<PosPaginationBar />` when needed.
 */
export function PosDataTable<TData>({
  columns,
  dataSource,
  rowKey,
  emptyText,
  summaryRow,
  hasBorder = true,
  fillHeight = false,
  rowClassName,
}: PosDataTableProps<TData>) {
  const hasFilterRow = columns.some((c) => c.filterRender != null);

  return (
    <table
      className={cn("w-full border-collapse text-left", fillHeight && "h-full")}
    >
      <thead className="bg-[#F3F4F6] text-[13px] font-semibold text-gray-700">
        <tr className={cn("h-10", hasBorder && "border-b border-gray-200")}>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={cn(
                "px-3 py-2",
                column.align === "right" ? "text-right" : "text-left",
                column.headerClassName,
              )}
            >
              {column.title}
            </th>
          ))}
        </tr>

        {hasFilterRow ? (
          <tr
            className={cn(
              "h-9 bg-white text-[13px] font-normal",
              hasBorder && "border-b border-gray-200",
            )}
          >
            {columns.map((column) => (
              <td key={column.key} className="px-2 py-1">
                {column.filterRender ?? null}
              </td>
            ))}
          </tr>
        ) : null}
      </thead>

      <tbody className="text-[14px]">
        {dataSource.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="px-4 py-12 text-center text-[13px] text-gray-400"
            >
              {emptyText}
            </td>
          </tr>
        ) : (
          dataSource.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "transition-colors hover:bg-gray-50",
                hasBorder && "border-b border-gray-200",
                rowClassName?.(row),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2.5",
                    column.align === "right" ? "text-right" : "text-left",
                    column.cellClassName,
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
        {fillHeight && summaryRow ? (
          <tr aria-hidden="true" className="bottom-cell-table-custom !h-full">
            <td colSpan={columns.length} className="p-0" />
          </tr>
        ) : null}
      </tbody>

      {summaryRow ? <tfoot className="bg-white">{summaryRow}</tfoot> : null}
    </table>
  );
}
