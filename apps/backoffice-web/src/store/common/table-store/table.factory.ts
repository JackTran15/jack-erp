import type { ReportTableConfig } from "../../../constants/reports/report.interface";
import { DEFAULT_PAGE_SIZE } from "./table.constant";
import type { TableInitialState } from "./table.interface";

// Dựng state khởi tạo cho store từ registry: thứ tự, ẩn/hiện, ghim, bề rộng đọc từ cấu hình cột.
export function buildInitialTableState(
  tableId: string,
  config: ReportTableConfig,
): TableInitialState {
  const visibility: Record<string, boolean> = {};
  const order: string[] = [];
  const left: string[] = [];
  const right: string[] = [];
  const sizing: Record<string, number> = {};

  for (const col of [...config.columns].sort((a, b) => a.order - b.order)) {
    const id = col.column;
    order.push(id);
    visibility[id] = col.visible !== false;
    const pinned = col.tableConfig?.pinned;
    if (pinned === "left") left.push(id);
    else if (pinned === "right") right.push(id);
    if (col.tableConfig?.width != null) sizing[id] = col.tableConfig.width;
  }

  return {
    tableId,
    config,
    columns: { visibility, order, pinning: { left, right }, sizing },
    filters: { global: "", columns: {} },
    sorting: { items: [] },
    pagination: { pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE },
  };
}
