import { useMemo, useState } from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@erp/ui";
import { CloudUpload, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useBranchStore } from "../../../../../../store/common/branch/branch.store";
import { useTableStore } from "../../../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../../../store/page-stores/report/report.context";
import {
  downloadReportExcel,
  fetchReportPrintPayload,
} from "../../../_api/report-export.api";
import { printHtmlDocument } from "../../../../../../lib/print/print-html-document";
import {
  ReportPrintOrientation,
  renderReportTableHtml,
} from "../../../../../../lib/print/render-report-table-html";

/**
 * Cặp nút In / Xuất khẩu.
 *
 * Tách khỏi `ReportPageToolbar` để chân dialog drill-down dùng lại được mà không
 * kéo theo nút "Thiết lập cột".
 *
 * KHÔNG nhận request qua props — nó tự đọc store. Trong dialog nó đọc store
 * LỒNG, nên file xuất khẩu tự động đúng phạm vi của dialog; truyền qua props sẽ
 * phá đúng tính chất đó.
 */
export function ReportExportButtons() {
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const config = useTableStore((s) => s.config);
  const columnsState = useTableStore((s) => s.columns);
  const appliedRequest = useReportStore((s) => s.appliedRequest);
  const branch = useReportStore((s) => s.branch);
  const activeBranchId = useBranchStore((s) => s.branchId);

  // Visible columns in display order — read from the live table state
  // (`columns.order` / `columns.visibility`), not from `config.columns`, which
  // only holds the *initial* layout and never changes when the user edits the
  // column dialog. Reading config here silently exports hidden columns.
  const visibleColumns = useMemo(() => {
    const byKey = new Map(config.columns.map((c) => [c.column, c]));
    return columnsState.order
      .filter((id) => columnsState.visibility[id] !== false && byKey.has(id))
      .map((id) => byKey.get(id)!);
  }, [config.columns, columnsState.order, columnsState.visibility]);

  const numericCols = useMemo(
    () =>
      new Set(
        config.columns
          .filter((c) => (c.tableConfig?.dataType ?? "number") === "number")
          .map((c) => c.column),
      ),
    [config.columns],
  );

  // Column labels as shown on screen; the server falls back to its catalog name
  // for anything omitted.
  const columnLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of visibleColumns) if (c.label) out[c.column] = c.label;
    return out;
  }, [visibleColumns]);

  // Nothing to export until a report has been applied and its columns loaded.
  const canExport = Boolean(appliedRequest) && visibleColumns.length > 0;

  // Print always covers every row for the applied filter, not just the
  // current page, so it fetches the payload fresh rather than reading the
  // table's on-screen page (AC-08).
  const handlePrint = async (orientation: ReportPrintOrientation) => {
    if (!appliedRequest || printing) return;
    setPrinting(true);
    try {
      const payload = await fetchReportPrintPayload({
        reportType: appliedRequest.reportType,
        branch,
        activeBranchId,
        filters: appliedRequest.filters,
        columnFilters: appliedRequest.columnFilters,
        columns: visibleColumns.map((c) => c.column),
        columnLabels,
        numericCols,
      });
      await printHtmlDocument(renderReportTableHtml(payload, orientation));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "In thất bại, vui lòng thử lại.",
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleExport = async () => {
    if (!appliedRequest || exporting) return;
    setExporting(true);
    try {
      await downloadReportExcel({
        reportType: appliedRequest.reportType,
        branch,
        activeBranchId,
        filters: appliedRequest.filters,
        columnFilters: appliedRequest.columnFilters,
        columns: visibleColumns.map((c) => c.column),
        columnLabels,
        numericCols,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Xuất khẩu thất bại, vui lòng thử lại.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canExport || printing}
          >
            {printing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-1 h-4 w-4" />
            )}
            In
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => void handlePrint("landscape")}>
            Khổ A4 (ngang)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handlePrint("portrait")}>
            Khổ A4 (dọc)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canExport || exporting}
        onClick={handleExport}
      >
        {exporting ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <CloudUpload className="mr-1 h-4 w-4" />
        )}
        Xuất khẩu
      </Button>
    </>
  );
}
