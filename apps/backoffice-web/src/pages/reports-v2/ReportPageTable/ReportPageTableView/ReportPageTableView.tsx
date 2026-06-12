import { Calendar } from "lucide-react";
import { ReportTableConfig } from "../../../../constants/reports/report.interface";
import {
  buildReportColumnSegments,
  formatReportNumber,
  getReportCellAlignClass,
  getReportColumnCode,
  getReportColumnWidth,
  isReportNumberColumn,
} from "../../../../lib/table";
import { ReportRow } from "../../_mock/report-daily-sales.mock";

interface Props {
  config: ReportTableConfig;
  rows: ReportRow[];
  totals: ReportRow;
}

export function ReportPageTableView({ config, rows, totals }: Props) {
  const visibleColumns = config.columns
    .filter((c) => c.visible !== false)
    .sort((a, b) => a.order - b.order);
  const segments = buildReportColumnSegments(visibleColumns);

  return (
    <div className="min-h-0 flex-1 overflow-auto border border-[#D9D9DE]">
      <table
        className="border-collapse text-[13px] text-[#212121]"
        style={{ width: "max-content", minWidth: "100%" }}
      >
        <thead className="bg-[#F5F5F6] text-[12px] font-bold">
          {/* Tầng 1: group header */}
          <tr>
            {segments.map((seg) => {
              if (seg.kind === "single") {
                const pin = seg.col.tableConfig?.pinned ?? null;
                const width = getReportColumnWidth(seg.col);
                return (
                  <th
                    key={seg.col.column}
                    rowSpan={2}
                    style={{ width, minWidth: width }}
                    className={[
                      "border border-[#E8E8EC] px-2 py-2 align-middle bg-[#F5F5F6]",
                      pin === "left" ? "sticky left-0 z-30 text-left" : "",
                      pin === "right" ? "sticky right-0 z-30 text-center" : "",
                      !pin ? "text-center" : "",
                    ].join(" ")}
                  >
                    {seg.col.label}
                    {getReportColumnCode(seg.col) && (
                      <div className="font-normal text-[#5C5C66]">{getReportColumnCode(seg.col)}</div>
                    )}
                  </th>
                );
              }
              return (
                <th
                  key={seg.label}
                  colSpan={seg.cols.length}
                  className="border border-[#E8E8EC] px-2 py-2 text-center align-middle"
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
                    const width = getReportColumnWidth(col);
                    return (
                      <th
                        key={col.column}
                        style={{ width, minWidth: width }}
                        className="border border-[#E8E8EC] px-2 py-2 text-center align-middle"
                      >
                        {col.label}
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
            {visibleColumns.map((col) => {
              const pin = col.tableConfig?.pinned ?? null;
              const isDate = col.tableConfig?.dataType === "date";
              return (
                <td
                  key={col.column}
                  className={[
                    "border border-[#E8E8EC] px-1.5 py-1 bg-[#F5F5F6]",
                    pin === "left" ? "sticky left-0 z-20" : "",
                    pin === "right" ? "sticky right-0 z-20" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-1 rounded-[2px] border border-[#D9D9DE] bg-white px-1.5 h-6">
                    <span className="text-[#6B6B75] text-[12px] select-none">
                      {isDate ? "=" : "≤"}
                    </span>
                    <input
                      className="w-full min-w-0 bg-transparent text-[12px] outline-none"
                      disabled
                    />
                    {isDate && <Calendar className="h-3.5 w-3.5 shrink-0 text-[#6B6B75]" />}
                  </div>
                </td>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-[#F8F8FA]">
              {visibleColumns.map((col) => {
                const pin = col.tableConfig?.pinned ?? null;
                const width = getReportColumnWidth(col);
                const raw = row[col.column];
                return (
                  <td
                    key={col.column}
                    style={{ width, minWidth: width }}
                    className={[
                      "border border-[#E8E8EC] px-2 py-1.5 align-middle bg-white",
                      getReportCellAlignClass(col),
                      pin === "left" ? "sticky left-0 z-10" : "",
                      pin === "right" ? "sticky right-0 z-10" : "",
                    ].join(" ")}
                  >
                    {col.tableConfig?.link ? (
                      <a className="text-[#3B5BDB] hover:underline cursor-pointer">
                        {raw ?? ""}
                      </a>
                    ) : isReportNumberColumn(col) ? (
                      formatReportNumber(raw)
                    ) : (
                      raw ?? ""
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>

        <tfoot className="bg-[#F5F5F6] font-bold">
          <tr>
            {visibleColumns.map((col, idx) => {
              const pin = col.tableConfig?.pinned ?? null;
              const raw = totals[col.column];
              return (
                <td
                  key={col.column}
                  className={[
                    "border border-[#E8E8EC] px-2 py-1.5 align-middle bg-[#F5F5F6]",
                    getReportCellAlignClass(col),
                    pin === "left" ? "sticky left-0 z-10" : "",
                    pin === "right" ? "sticky right-0 z-10" : "",
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
