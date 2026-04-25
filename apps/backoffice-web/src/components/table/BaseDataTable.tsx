import type React from "react";

export interface TableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
}

interface BaseDataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  loading: boolean;
  emptyLabel: string;
  actionsLabel?: string;
  renderActions?: (row: T) => React.ReactNode;
  getRowKey: (row: T, index: number) => string;
}

export function BaseDataTable<T>({
  columns,
  rows,
  loading,
  emptyLabel,
  actionsLabel = "Thao tác",
  renderActions,
  getRowKey,
}: BaseDataTableProps<T>) {
  const colSpan = columns.length + (renderActions ? 1 : 0);

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="text-left px-3 py-2.5 border-b-2 border-gray-200 bg-gray-50 font-semibold text-[13px] whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
            {renderActions && (
              <th className="text-left px-3 py-2.5 border-b-2 border-gray-200 bg-gray-50 font-semibold text-[13px] whitespace-nowrap">
                {actionsLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="px-3 py-6 text-center text-gray-500" colSpan={colSpan}>
                Đang tải…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-gray-500" colSpan={colSpan}>
                {emptyLabel}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row, index) => (
              <tr key={getRowKey(row, index)} className="border-b border-gray-100">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2.5 align-middle">
                    {column.render(row)}
                  </td>
                ))}
                {renderActions && (
                  <td className="px-3 py-2.5 align-middle">{renderActions(row)}</td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
