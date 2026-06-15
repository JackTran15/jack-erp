import { useMemo, useState } from "react";
import {
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type Header,
} from "@tanstack/react-table";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { ReportColumnConfig } from "../../../../../constants/reports/report.interface";
import {
  DEFAULT_REPORT_COLUMN_WIDTH,
  buildReportColumnSegments,
  formatReportNumber,
  getReportCellAlignClass,
  getReportColumnCode,
  groupPinPosition,
  isReportNumberColumn,
  pinPosition,
} from "../../../../../lib/table";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnFilterMode,
} from "../../../../../components/table/pagination.dto";
import { useTableStore } from "../../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";
import { ReportRow } from "../../_mock/report-daily-sales.mock";
import { SortableHeaderCell, type DragData } from "./SortableHeaderCell/SortableHeaderCell";
import { FilterHeaderCell } from "./FilterHeaderCell/FilterHeaderCell";

interface Props {
  rows: ReportRow[];
  totals: ReportRow;
}

const cellBorder = "border-b border-r border-border";

// Một "unit" kéo-thả cấp top: cột đơn (key = columnId) hoặc group (key = `group:<label>`, gộp leaf liên tiếp).
interface ColumnUnit {
  key: string;
  ids: string[];
}

function buildUnits(order: string[], configById: Map<string, ReportColumnConfig>): ColumnUnit[] {
  const units: ColumnUnit[] = [];
  for (const id of order) {
    const group = configById.get(id)?.group ?? null;
    const key = group ? `group:${group}` : id;
    const last = units[units.length - 1];
    if (group && last && last.key === key) last.ids.push(id);
    else units.push({ key, ids: [id] });
  }
  return units;
}

export function ReportPageTableView({ rows, totals }: Props) {
  const config = useTableStore((s) => s.config);
  const visibility = useTableStore((s) => s.columns.visibility);
  const order = useTableStore((s) => s.columns.order);
  const pinning = useTableStore((s) => s.columns.pinning);
  const sizing = useTableStore((s) => s.columns.sizing);
  const sorting = useTableStore((s) => s.sorting.items);
  const columnsActions = useTableStore((s) => s.columnsActions);
  const sortingActions = useTableStore((s) => s.sortingActions);
  // Column filter gom chung ở report store (đồng bộ với filter header/popover).
  const columnFilters = useReportStore((s) => s.columnFilters);
  const setColumnFilter = useReportStore((s) => s.actions.setColumnFilter);

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

  // Kéo-thả đổi vị trí cột/group bằng @dnd-kit. Group dời nguyên khối; con chỉ đổi trong cùng group.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeData, setActiveData] = useState<DragData | null>(null);
  const [validOverId, setValidOverId] = useState<string | null>(null);
  const units = useMemo(() => buildUnits(order, configById), [order, configById]);

  // Quy điểm thả về id ô được chỉ-báo (null nếu không hợp lệ). Kéo group thì chỉ-báo trên ô group đích.
  const resolveValidOverId = (source: DragData, over: DragData): string | null => {
    if (source.level === "top") {
      const targetKey = over.level === "top" ? over.key : `group:${over.group}`;
      return source.key !== targetKey ? targetKey : null;
    }
    if (over.level === "child" && over.group === source.group && over.id !== source.id) return over.id;
    return null;
  };

  // Tính order mới khi thả source lên over (null nếu không đổi). Top→arrayMove unit; child→arrayMove trong group.
  const reorder = (source: DragData, over: DragData): string[] | null => {
    if (source.level === "top") {
      const targetKey = over.level === "top" ? over.key : `group:${over.group}`;
      if (source.key === targetKey) return null;
      const from = units.findIndex((u) => u.key === source.key);
      const to = units.findIndex((u) => u.key === targetKey);
      if (from < 0 || to < 0) return null;
      return arrayMove(units, from, to).flatMap((u) => u.ids);
    }
    if (over.level === "child" && over.group === source.group && over.id !== source.id) {
      const gi = units.findIndex((u) => u.key === `group:${source.group}`);
      if (gi < 0) return null;
      const from = units[gi].ids.indexOf(source.id);
      const to = units[gi].ids.indexOf(over.id);
      if (from < 0 || to < 0) return null;
      const next = [...units];
      next[gi] = { ...units[gi], ids: arrayMove(units[gi].ids, from, to) };
      return next.flatMap((u) => u.ids);
    }
    return null;
  };

  // Các column id bị ảnh hưởng khi kéo (group → cả cụm) — dùng để bỏ ghim.
  const draggedIds = (source: DragData): string[] => {
    if (source.level === "child") return [source.id];
    return units.find((u) => u.key === source.key)?.ids ?? [];
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveData((e.active.data.current as DragData | undefined) ?? null);
  };
  const handleDragOver = (e: DragOverEvent) => {
    const source = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DragData | undefined;
    setValidOverId(source && over ? resolveValidOverId(source, over) : null);
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const source = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DragData | undefined;
    setActiveData(null);
    setValidOverId(null);
    if (!source || !over) return;
    const next = reorder(source, over);
    if (!next) return;
    columnsActions.setOrder(next);
    // Kéo cột đang ghim → bỏ ghim cột đó (group thì bỏ cả cụm).
    const draggedSet = new Set(draggedIds(source));
    const wasPinned = [...draggedSet].some(
      (id) => (pinning.left ?? []).includes(id) || (pinning.right ?? []).includes(id),
    );
    if (wasPinned) {
      columnsActions.setPinning((prev) => ({
        left: (prev.left ?? []).filter((id) => !draggedSet.has(id)),
        right: (prev.right ?? []).filter((id) => !draggedSet.has(id)),
      }));
    }
  };
  const handleDragCancel = () => {
    setActiveData(null);
    setValidOverId(null);
  };

  // Tay cầm kéo resize ở mép phải header cell; chặn sensor drag khi nắm mép (stopPropagation pointerdown).
  const renderResizeHandle = (column: Column<ReportRow>) => {
    const header = headerById.get(column.id);
    if (!header || !column.getCanResize()) return null;
    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-blue-500"
      />
    );
  };

  // Tier-1 group header dựng từ các cột đang hiển thị theo đúng thứ tự vật lý.
  const orderedConfigs = orderedLeaf
    .map((c) => configById.get(c.id))
    .filter((c): c is ReportColumnConfig => Boolean(c));
  const segments = buildReportColumnSegments(orderedConfigs);
  const topItems = segments.map((seg) =>
    seg.kind === "single" ? seg.col.column : `group:${seg.label}`,
  );

  // Nhãn hiển thị trong DragOverlay (bản xem trước nổi của unit đang kéo).
  const overlayLabel = (data: DragData): string => {
    if (data.level === "child") return configById.get(data.id)?.label ?? data.id;
    if (data.key.startsWith("group:")) return data.key.slice("group:".length);
    return configById.get(data.key)?.label ?? data.key;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="min-h-0 flex-1 overflow-auto border border-border bg-background">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          <thead className="bg-muted text-xs font-semibold">
            {/* Tầng 1: group header */}
            <SortableContext items={topItems} strategy={horizontalListSortingStrategy}>
              <tr>
                {segments.map((seg) => {
                  if (seg.kind === "single") {
                    const column = columnById.get(seg.col.column);
                    if (!column) return null;
                    const pinned = column.getIsPinned();
                    const width = column.getSize();
                    const id = seg.col.column;
                    return (
                      <SortableHeaderCell
                        key={id}
                        id={id}
                        data={{ level: "top", key: id }}
                        validOver={validOverId === id}
                        rowSpan={2}
                        style={{ width, minWidth: width, ...pinPosition(column) }}
                        className={[
                          `relative cursor-grab ${cellBorder} px-2 py-2 align-middle bg-muted`,
                          pinned ? "z-30" : "",
                          pinned === "right"
                            ? "text-center"
                            : pinned === "left"
                              ? "text-left"
                              : "text-center",
                        ].join(" ")}
                        resizeHandle={renderResizeHandle(column)}
                      >
                        {seg.col.label}
                        {getReportColumnCode(seg.col) && (
                          <div className="font-normal text-muted-foreground">
                            {getReportColumnCode(seg.col)}
                          </div>
                        )}
                      </SortableHeaderCell>
                    );
                  }
                  const groupStyle = groupPinPosition(seg, columnById);
                  const groupPinned = "position" in groupStyle;
                  const id = `group:${seg.label}`;
                  return (
                    <SortableHeaderCell
                      key={seg.label}
                      id={id}
                      data={{ level: "top", key: id }}
                      validOver={validOverId === id}
                      colSpan={seg.cols.length}
                      style={groupStyle}
                      className={[
                        `cursor-grab ${cellBorder} px-2 py-2 text-center align-middle bg-muted`,
                        groupPinned ? "z-30" : "",
                      ].join(" ")}
                    >
                      {seg.label}
                    </SortableHeaderCell>
                  );
                })}
              </tr>
            </SortableContext>
            {/* Tầng 2: column header */}
            <tr>
              {segments.map((seg) =>
                seg.kind === "group" ? (
                  <SortableContext
                    key={seg.label}
                    items={seg.cols.map((c) => c.column)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {seg.cols.map((col) => {
                      const column = columnById.get(col.column);
                      if (!column) return null;
                      const pinned = column.getIsPinned();
                      const width = column.getSize();
                      const id = col.column;
                      return (
                        <SortableHeaderCell
                          key={id}
                          id={id}
                          data={{ level: "child", id, group: seg.label }}
                          validOver={validOverId === id}
                          style={{ width, minWidth: width, ...pinPosition(column) }}
                          className={[
                            `relative cursor-grab ${cellBorder} px-2 py-2 text-center align-middle bg-muted`,
                            pinned ? "z-30" : "",
                          ].join(" ")}
                          resizeHandle={renderResizeHandle(column)}
                        >
                          {col.label}
                          {getReportColumnCode(col) && (
                            <div className="font-normal text-muted-foreground">
                              {getReportColumnCode(col)}
                            </div>
                          )}
                        </SortableHeaderCell>
                      );
                    })}
                  </SortableContext>
                ) : null,
              )}
            </tr>
            {/* Tầng 3: filter row */}
            <tr>
              {orderedLeaf.map((column) => {
                const col = configById.get(column.id);
                if (!col) return null;
                const filter = columnFilters[col.column];
                return (
                  <FilterHeaderCell
                    key={column.id}
                    col={col}
                    style={pinPosition(column)}
                    pinned={Boolean(column.getIsPinned())}
                    value={filter?.value ?? ""}
                    operator={
                      (filter?.operator as ColumnFilterMode) || DEFAULT_COLUMN_FILTER_MODE
                    }
                    onOperatorChange={(mode) =>
                      setColumnFilter(col.column, { operator: mode })
                    }
                    onValueChange={(v) => setColumnFilter(col.column, { value: v })}
                  />
                );
              })}
            </tr>
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => {
              const cells = [
                ...row.getLeftVisibleCells(),
                ...row.getCenterVisibleCells(),
                ...row.getRightVisibleCells(),
              ];
              const rowBg = rowIndex % 2 === 0 ? "bg-background" : "bg-muted/20";
              return (
                <tr key={row.id} className={`${rowBg} hover:bg-blue-50/70`}>
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
                          `${cellBorder} h-8 px-2 py-0 align-middle`,
                          getReportCellAlignClass(col),
                          pinned ? `z-10 ${rowBg}` : "",
                        ].join(" ")}
                      >
                        {col.tableConfig?.link ? (
                          <a className="text-blue-600 hover:underline cursor-pointer">{raw ?? ""}</a>
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

          <tfoot className="bg-muted text-xs font-semibold">
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
                      `${cellBorder} h-8 px-2 py-0 align-middle bg-muted`,
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

      <DragOverlay modifiers={[restrictToHorizontalAxis]}>
        {activeData ? (
          <div className="cursor-grabbing rounded-[2px] border border-blue-500 bg-muted px-2 py-2 text-xs font-semibold text-foreground shadow-md">
            {overlayLabel(activeData)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
