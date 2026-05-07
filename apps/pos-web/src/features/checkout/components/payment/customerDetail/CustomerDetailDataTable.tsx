import { cn } from "@erp/ui";
import type { ReactNode } from "react";

type CustomerDetailTableAlign = "left" | "right";

export interface CustomerDetailTableColumn<TData> {
  key: string;
  title: ReactNode;
  align?: CustomerDetailTableAlign;
  render: (row: TData) => ReactNode;
  filterRender?: ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface CustomerDetailDataTableProps<TData> {
  columns: ReadonlyArray<CustomerDetailTableColumn<TData>>;
  dataSource: ReadonlyArray<TData>;
  rowKey: (row: TData) => string;
  emptyText: string;
  summaryRow?: ReactNode;
  rowClassName?: (row: TData) => string | undefined;
}

export function CustomerDetailDataTable<TData>({
  columns,
  dataSource,
  rowKey,
  emptyText,
  summaryRow,
  rowClassName,
}: CustomerDetailDataTableProps<TData>) {
  const hasFilterRow = columns.some((c) => c.filterRender != null);

  return (
    <table className="w-full border-collapse text-left">
      <thead className="bg-[#F3F4F6] text-[13px] font-semibold text-gray-700">
        <tr className="h-10">
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
          <tr className="h-9 border-t border-gray-200 bg-white text-[13px] font-normal">
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
                "border-t border-gray-200 transition-colors hover:bg-gray-50",
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
      </tbody>

      {summaryRow ? <tfoot className="bg-white">{summaryRow}</tfoot> : null}
    </table>
  );
}
