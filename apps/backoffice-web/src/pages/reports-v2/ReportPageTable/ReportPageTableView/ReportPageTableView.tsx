import { useMemo, useRef, useState, type DragEvent } from "react";
import { Calendar } from "lucide-react";
import {
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Header,
} from "@tanstack/react-table";
import { ReportColumnConfig } from "../../../../constants/reports/report.interface";
import {
  DEFAULT_REPORT_COLUMN_WIDTH,
  buildReportColumnSegments,
  canDrop,
  cellKey,
  draggedColumnIds,
  formatReportNumber,
  getReportCellAlignClass,
  getReportColumnCode,
  groupPinPosition,
  isReportNumberColumn,
  pinPosition,
  reorderByDrag,
  type DragToken,
} from "../../../../lib/table";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { ReportRow } from "../../_mock/report-daily-sales.mock";

interface Props {
  rows: ReportRow[];
  totals: ReportRow;
}

const cellBorder = "border-b border-r border-[#E8E8EC]";

export function ReportPageTableView({ rows, totals }: Props) {
  const config = useTableStore((s) => s.config);
  const visibility = useTableStore((s) => s.columns.visibility);
  const order = useTableStore((s) => s.columns.order);
  const pinning = useTableStore((s) => s.columns.pinning);
  const sizing = useTableStore((s) => s.columns.sizing);
  const sorting = useTableStore((s) => s.sorting.items);
  const columnFilters = useTableStore((s) => s.filters.columns);
  const columnsActions = useTableStore((s) => s.columnsActions);
  const sortingActions = useTableStore((s) => s.sortingActions);
  const filtersActions = useTableStore((s) => s.filtersActions);

  // Tra cứu cấu hình cột theo id để render metadata (label, group, mã, align, link).
  const configById = useMemo(() => {
    const map = new Map<string, ReportColumnConfig>();
    for (const col of config.columns) map.set(col.column, col);
    return map;
  }, [config.columns]);

  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () =>
      config.columns.map((col) => ({
        id: col.column,
        accessorFn: (row) => row[col.column],
        size: col.tableConfig?.width ?? DEFAULT_REPORT_COLUMN_WIDTH,
      })),
    [config.columns],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnVisibility: visibility,
      columnOrder: order,
      columnPinning: pinning,
      columnSizing: sizing,
      sorting,
    },
    onColumnVisibilityChange: columnsActions.setVisibility,
    onColumnOrderChange: columnsActions.setOrder,
    onColumnPinningChange: columnsActions.setPinning,
    onColumnSizingChange: columnsActions.setSizing,
    onSortingChange: sortingActions.setSorting,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    enableColumnPinning: true,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
  });

  // Thứ tự render vật lý: cột ghim trái → giữa → ghim phải, để offset sticky chính xác.
  const orderedLeaf = [
    ...table.getLeftVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getRightVisibleLeafColumns(),
  ];
  const columnById = useMemo(() => {
    const map = new Map<string, Column<ReportRow>>();
    for (const c of orderedLeaf) map.set(c.id, c);
    return map;
  }, [orderedLeaf]);
  const headerById = useMemo(() => {
    const map = new Map<string, Header<ReportRow, unknown>>();
    for (const h of table.getFlatHeaders()) map.set(h.column.id, h);
    return map;
  }, [table, sizing, order, visibility, pinning]);

  // Kéo-thả đổi vị trí cột/group (HTML5 DnD gốc, tránh xung đột transform với cột sticky).
  const dragTokenRef = useRef<DragToken | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  // Tắt draggable khi con trỏ ở trên tay cầm resize → mousedown ở mép = resize, không bị native drag chiếm.
  const [canDrag, setCanDrag] = useState(true);

  const clearDrag = () => {
    dragTokenRef.current = null;
    setDraggingKey(null);
    setDragOverKey(null);
  };
  const handleDrop = (target: DragToken) => {
    const source = dragTokenRef.current;
    if (source) {
      const next = reorderByDrag(order, configById, source, target);
      if (next) {
        columnsActions.setOrder(next);
        // Kéo cột đang fixed → bỏ ghim cột đó (group thì bỏ cả cụm).
        const dragged = draggedColumnIds(source, order, configById);
        const draggedSet = new Set(dragged);
        const wasPinned = dragged.some(
          (id) => (pinning.left ?? []).includes(id) || (pinning.right ?? []).includes(id),
        );
        if (wasPinned) {
          columnsActions.setPinning((prev) => ({
            left: (prev.left ?? []).filter((id) => !draggedSet.has(id)),
            right: (prev.right ?? []).filter((id) => !draggedSet.has(id)),
          }));
        }
      }
    }
    clearDrag();
  };
  const onCellDragOver = (token: DragToken, e: DragEvent<HTMLTableCellElement>) => {
    const source = dragTokenRef.current;
    if (!source || !canDrop(source, token)) return;
    e.preventDefault();
    const key = cellKey(token);
    setDragOverKey((prev) => (prev === key ? prev : key));
  };

  // Toàn bộ header cell kéo được; bỏ qua khi thao tác bắt đầu từ vùng resize handle.
  const dragProps = (token: DragToken) => ({
    draggable: canDrag,
    onDragStart: (e: DragEvent<HTMLTableCellElement>) => {
      if (!canDrag || (e.target as HTMLElement).closest("[data-resize-handle]")) {
        e.preventDefault();
        return;
      }
      dragTokenRef.current = token;
      setDraggingKey(cellKey(token));
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "");
    },
    onDragEnd: clearDrag,
    onDragOver: (e: DragEvent<HTMLTableCellElement>) => onCellDragOver(token, e),
    onDrop: () => handleDrop(token),
  });

  // Tay cầm kéo resize, đặt ở mép phải header cell (cell phải có position: relative).
  const renderResizeHandle = (column: Column<ReportRow>) => {
    const header = headerById.get(column.id);
    if (!header || !column.getCanResize()) return null;
    return (
      <div
        data-resize-handle
        onMouseEnter={() => setCanDrag(false)}
        onMouseLeave={() => setCanDrag(true)}
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[#3B5BDB]"
      />
    );
  };

  // Tier-1 group header dựng từ các cột đang hiển thị theo đúng thứ tự vật lý.
  const orderedConfigs = orderedLeaf
    .map((c) => configById.get(c.id))
    .filter((c): c is ReportColumnConfig => Boolean(c));
  const segments = buildReportColumnSegments(orderedConfigs);

  return (
    <div className="min-h-0 flex-1 overflow-auto border border-[#D9D9DE]">
      <table
        className="border-separate border-spacing-0 text-[13px] text-[#212121]"
        style={{ width: "max-content", minWidth: "100%" }}
      >
        <thead className="bg-[#F5F5F6] text-[12px] font-bold">
          {/* Tầng 1: group header */}
          <tr>
            {segments.map((seg) => {
              if (seg.kind === "single") {
                const column = columnById.get(seg.col.column);
                if (!column) return null;
                const pinned = column.getIsPinned();
                const width = column.getSize();
                const token: DragToken = { level: "top", key: seg.col.column };
                const key = cellKey(token);
                return (
                  <th
                    key={seg.col.column}
                    rowSpan={2}
                    {...dragProps(token)}
                    style={{
                      width,
                      minWidth: width,
                      ...pinPosition(column),
                      ...(dragOverKey === key ? { boxShadow: "inset 2px 0 0 0 #3B5BDB" } : {}),
                    }}
                    className={[
                      `relative cursor-grab ${cellBorder} px-2 py-2 align-middle bg-[#F5F5F6]`,
                      pinned ? "z-30" : "",
                      draggingKey === key ? "opacity-40" : "",
                      pinned === "right" ? "text-center" : pinned === "left" ? "text-left" : "text-center",
                    ].join(" ")}
                  >
                    {seg.col.label}
                    {renderResizeHandle(column)}
                    {getReportColumnCode(seg.col) && (
                      <div className="font-normal text-[#5C5C66]">{getReportColumnCode(seg.col)}</div>
                    )}
                  </th>
                );
              }
              const groupStyle = groupPinPosition(seg, columnById);
              const groupPinned = "position" in groupStyle;
              const token: DragToken = { level: "top", key: `group:${seg.label}` };
              const key = cellKey(token);
              return (
                <th
                  key={seg.label}
                  colSpan={seg.cols.length}
                  {...dragProps(token)}
                  style={{
                    ...groupStyle,
                    ...(dragOverKey === key ? { boxShadow: "inset 2px 0 0 0 #3B5BDB" } : {}),
                  }}
                  className={[
                    `cursor-grab ${cellBorder} px-2 py-2 text-center align-middle bg-[#F5F5F6]`,
                    groupPinned ? "z-30" : "",
                    draggingKey === key ? "opacity-40" : "",
                  ].join(" ")}
                >
                  {seg.label}
                </th>
              );
            })}
          </tr>
          {/* Tầng 2: column header */}
          <tr>
            {segments.flatMap((seg) =>
              seg.kind === "group"
                ? seg.cols.map((col) => {
                    const column = columnById.get(col.column);
                    if (!column) return null;
                    const pinned = column.getIsPinned();
                    const width = column.getSize();
                    const token: DragToken = { level: "child", id: col.column, group: seg.label };
                    const key = cellKey(token);
                    return (
                      <th
                        key={col.column}
                        {...dragProps(token)}
                        style={{
                          width,
                          minWidth: width,
                          ...pinPosition(column),
                          ...(dragOverKey === key ? { boxShadow: "inset 2px 0 0 0 #3B5BDB" } : {}),
                        }}
                        className={[
                          `relative cursor-grab ${cellBorder} px-2 py-2 text-center align-middle bg-[#F5F5F6]`,
                          pinned ? "z-30" : "",
                          draggingKey === key ? "opacity-40" : "",
                        ].join(" ")}
                      >
                        {col.label}
                        {renderResizeHandle(column)}
                        {getReportColumnCode(col) && (
                          <div className="font-normal text-[#5C5C66]">{getReportColumnCode(col)}</div>
                        )}
                      </th>
                    );
                  })
                : [],
            )}
          </tr>
          {/* Tầng 3: filter row */}
          <tr>
            {orderedLeaf.map((column) => {
              const col = configById.get(column.id);
              if (!col) return null;
              const pinned = column.getIsPinned();
              const isDate = col.tableConfig?.dataType === "date";
              const value = columnFilters[col.column]?.value ?? "";
              return (
                <td
                  key={column.id}
                  style={pinPosition(column)}
                  className={[
                    `${cellBorder} px-1.5 py-1 bg-[#F5F5F6]`,
                    pinned ? "z-20" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-1 rounded-[2px] border border-[#D9D9DE] bg-white px-1.5 h-6">
                    <span className="text-[#6B6B75] text-[12px] select-none">
                      {isDate ? "=" : "≤"}
                    </span>
                    <input
                      className="w-full min-w-0 bg-transparent text-[12px] outline-none"
                      value={value}
                      onChange={(e) =>
                        filtersActions.setColumnFilter(col.column, { value: e.target.value })
                      }
                    />
                    {isDate && <Calendar className="h-3.5 w-3.5 shrink-0 text-[#6B6B75]" />}
                  </div>
                </td>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => {
            const cells = [
              ...row.getLeftVisibleCells(),
              ...row.getCenterVisibleCells(),
              ...row.getRightVisibleCells(),
            ];
            return (
              <tr key={row.id} className="hover:bg-[#F8F8FA]">
                {cells.map((cell) => {
                  const col = configById.get(cell.column.id);
                  if (!col) return null;
                  const pinned = cell.column.getIsPinned();
                  const width = cell.column.getSize();
                  const raw = cell.getValue() as number | string | undefined;
                  return (
                    <td
                      key={cell.id}
                      style={{ width, minWidth: width, ...pinPosition(cell.column) }}
                      className={[
                        `${cellBorder} px-2 py-1.5 align-middle bg-white`,
                        getReportCellAlignClass(col),
                        pinned ? "z-10" : "",
                      ].join(" ")}
                    >
                      {col.tableConfig?.link ? (
                        <a className="text-[#3B5BDB] hover:underline cursor-pointer">{raw ?? ""}</a>
                      ) : isReportNumberColumn(col) ? (
                        formatReportNumber(raw)
                      ) : (
                        raw ?? ""
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>

        <tfoot className="bg-[#F5F5F6] font-bold">
          <tr>
            {orderedLeaf.map((column, idx) => {
              const col = configById.get(column.id);
              if (!col) return null;
              const pinned = column.getIsPinned();
              const raw = totals[col.column];
              return (
                <td
                  key={column.id}
                  style={pinPosition(column)}
                  className={[
                    `${cellBorder} px-2 py-1.5 align-middle bg-[#F5F5F6]`,
                    getReportCellAlignClass(col),
                    pinned ? "z-10" : "",
                  ].join(" ")}
                >
                  {idx === 0
                    ? config.summaryLabel ?? ""
                    : isReportNumberColumn(col)
                      ? formatReportNumber(raw)
                      : raw ?? ""}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
