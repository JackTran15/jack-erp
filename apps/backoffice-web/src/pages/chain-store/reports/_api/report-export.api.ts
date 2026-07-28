import { PROFIT_REPORT_KEYS, ReportDocumentPayload } from "@erp/shared-interfaces";
import { apiClient } from "../../../../lib/api-axios";
import { triggerBlobDownload } from "../../../../lib/download";
import {
  getReportBackendKey,
  getReportBackendSource,
} from "../../../../constants/reports/report-type.constant";
import type { STORE_TYPE } from "../../../../constants/store.constant";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";
import { buildColumnFilters, buildSearchFilters } from "./invoice-report.api";
import { buildInventorySearchFilters } from "./inventory-report-v2.api";
import { buildDebtColumnFilters, buildDebtSearchFilters } from "./debt-report.api";
import {
  buildBusinessResultsSearchFilters,
  buildProfitColumnFilters,
  buildProfitSearchFilters,
} from "./profit-report.api";

/**
 * Excel export for every report domain.
 *
 * Mirrors `report-data-source.ts`: same branch-by-backendSource dispatch, same
 * filter builders. Reusing them is the point — the exported file has to be the
 * same query the table on screen ran, and duplicating filter construction is
 * how those two silently drift apart.
 *
 * The visible column list travels with the request, so the server never reads a
 * saved template and the file always matches what the user is looking at.
 */

/** Endpoint prefix per backend domain. */
const EXPORT_PATH: Record<string, string> = {
  invoice: "/reports/invoices/export",
  inventory: "/reports/inventory/export",
  debt: "/reports/debts/export",
  profit: "/reports/profit/export",
};

/** Print-payload endpoint per backend domain — same request body as export. */
const PRINT_PAYLOAD_PATH: Record<string, string> = {
  invoice: "/reports/invoices/print-payload",
  inventory: "/reports/inventory/print-payload",
  debt: "/reports/debts/print-payload",
  profit: "/reports/profit/print-payload",
};

export interface ReportExportArgs {
  reportType: string;
  branch: STORE_TYPE;
  /** Branch selected in the ERP header (null in chain mode). */
  activeBranchId?: string | null;
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
  /** Visible columns, in display order. */
  columns: string[];
  /** Only the columns the user renamed. */
  columnLabels?: Record<string, string>;
  numericCols: Set<string>;
}

/** Build the domain-specific request body; no `page`/`limit` — export is whole-set. */
function buildExportBody(
  args: ReportExportArgs,
  backendKey: string,
  source: string,
): Record<string, unknown> {
  const base = {
    reportType: backendKey,
    columns: args.columns,
    ...(args.columnLabels && Object.keys(args.columnLabels).length
      ? { columnLabels: args.columnLabels }
      : {}),
  };

  if (source === "inventory") {
    return {
      ...base,
      filters: buildInventorySearchFilters(args.filters, {
        branch: args.branch,
        activeBranchId: args.activeBranchId,
        backendKey,
      }),
      columnFilters: buildColumnFilters(args.columnFilters, args.numericCols),
    };
  }
  if (source === "debt") {
    return {
      ...base,
      filters: buildDebtSearchFilters(args.filters, {
        activeBranchId: args.activeBranchId,
      }),
      columnFilters: buildDebtColumnFilters(args.columnFilters, args.numericCols),
    };
  }
  if (source === "profit") {
    // business-results spans two periods; the others use one date range.
    const buildFilters =
      backendKey === PROFIT_REPORT_KEYS.BUSINESS_RESULTS
        ? buildBusinessResultsSearchFilters
        : buildProfitSearchFilters;
    return {
      ...base,
      filters: buildFilters(args.filters, {
        activeBranchId: args.activeBranchId,
      }),
      columnFilters: buildProfitColumnFilters(args.columnFilters, args.numericCols),
    };
  }
  return {
    ...base,
    filters: buildSearchFilters(args.filters),
    columnFilters: buildColumnFilters(args.columnFilters, args.numericCols),
  };
}

/** Read the server-chosen filename; it already carries the report's Vietnamese name. */
function filenameFrom(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const match = /filename="?([^"\n]+)"?/i.exec(disposition);
  return match?.[1]?.trim() || fallback;
}

/**
 * Download the current report as .xlsx. Rejects when the report type has no
 * backend mapping, so a caller can keep the button disabled for those.
 */
export async function downloadReportExcel(args: ReportExportArgs): Promise<void> {
  const backendKey = getReportBackendKey(args.reportType);
  if (!backendKey) {
    throw new Error(`Báo cáo chưa hỗ trợ xuất khẩu: ${args.reportType}`);
  }
  const source = getReportBackendSource(args.reportType);
  const path = EXPORT_PATH[source] ?? EXPORT_PATH.invoice;

  const response = await apiClient.post<Blob>(
    path,
    buildExportBody(args, backendKey, source),
    { responseType: "blob" },
  );

  triggerBlobDownload(
    response.data,
    filenameFrom(response.headers?.["content-disposition"], "bao-cao.xlsx"),
  );
}

/**
 * Fetch the print-ready payload for the current report — same request body
 * as `downloadReportExcel`, so a printed page and an exported file can never
 * disagree (ADR-01).
 */
export async function fetchReportPrintPayload(
  args: ReportExportArgs,
): Promise<ReportDocumentPayload> {
  const backendKey = getReportBackendKey(args.reportType);
  if (!backendKey) {
    throw new Error(`Báo cáo chưa hỗ trợ in: ${args.reportType}`);
  }
  const source = getReportBackendSource(args.reportType);
  const path = PRINT_PAYLOAD_PATH[source] ?? PRINT_PAYLOAD_PATH.invoice;

  const response = await apiClient.post<ReportDocumentPayload>(
    path,
    buildExportBody(args, backendKey, source),
  );
  return response.data;
}
