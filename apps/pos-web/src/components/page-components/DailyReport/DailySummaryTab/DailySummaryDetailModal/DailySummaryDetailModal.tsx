import { useEffect, useMemo, useState } from "react";
import { cn } from "@erp/ui";
import type {
  ColumnFilter,
  PosDailySummaryDetailRow,
  ReportDateRangeFilter,
} from "@erp/shared-interfaces";
import { PosDailySummaryDetailCategory } from "@erp/shared-interfaces";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  DAILY_SUMMARY_DETAIL_COLUMN_LABELS,
  DAILY_SUMMARY_DETAIL_CONFIG,
  DAILY_SUMMARY_DETAIL_DEFAULT_PAGE_SIZE,
  DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES,
  DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS,
  DailySummaryDetailColumnKey,
} from "@erp/pos/constants/daily-summary-detail.constant";
import { useDailySummaryDetailQuery } from "@erp/pos/hooks/react-query/use-query-daily-report";
import { useDebounce } from "@erp/pos/hooks/common/use-debounce";
import {
  formatNumberVi,
  formatPrintedAtVi,
} from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type { PosDailySummaryDetailBody } from "@erp/pos/dtos/daily-report.dto";

export interface DailySummaryDetailModalProps {
  /** Category being drilled into; `null` = modal closed. */
  category: PosDailySummaryDetailCategory | null;
  issuedAt: ReportDateRangeFilter;
  cashierId: string | null;
  salespersonId: string | null;
  onClose: () => void;
}

/** "Thời gian" has no filter — Loại chứng từ uses a select (see ALL_VALUE), not a text/number filter cell. */
const FILTERABLE_KEYS = new Set<DailySummaryDetailColumnKey>([
  DailySummaryDetailColumnKey.DocumentNumber,
  DailySummaryDetailColumnKey.CustomerName,
  DailySummaryDetailColumnKey.BankAccountName,
  DailySummaryDetailColumnKey.Amount,
  DailySummaryDetailColumnKey.PointsUsed,
  DailySummaryDetailColumnKey.PointsValue,
]);

const ALL_VALUE = "";

function cellText(row: PosDailySummaryDetailRow, key: DailySummaryDetailColumnKey): string {
  if (key === DailySummaryDetailColumnKey.IssuedAt) {
    return row.issuedAt ? formatPrintedAtVi(new Date(row.issuedAt)) : "";
  }
  const value = (row as unknown as Record<string, string | number | undefined>)[key];
  if (DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS.has(key)) {
    return formatNumberVi(value as number | undefined);
  }
  return value === null || value === undefined ? "" : String(value);
}

function toColumnFilter(
  col: string,
  op: FilterOperatorEnum,
  numeric: boolean,
  raw: string,
): ColumnFilter | null {
  if (numeric) {
    const num = Number(raw.replace(/[.,\s]/g, ""));
    if (!Number.isFinite(num)) return null;
    switch (op) {
      case FilterOperatorEnum.LESS_THAN:
        return { col, lt: num };
      case FilterOperatorEnum.LESS_THAN_OR_EQUAL:
        return { col, lte: num };
      case FilterOperatorEnum.GREATER_THAN:
        return { col, gt: num };
      case FilterOperatorEnum.GREATER_THAN_OR_EQUAL:
        return { col, gte: num };
      default:
        return { col, eq: num };
    }
  }
  switch (op) {
    case FilterOperatorEnum.EQUALS:
      return { col, equals: raw };
    case FilterOperatorEnum.STARTS_WITH:
      return { col, startsWith: raw };
    case FilterOperatorEnum.ENDS_WITH:
      return { col, endsWith: raw };
    case FilterOperatorEnum.NOT_CONTAINS:
      return { col, notContains: raw };
    default:
      return { col, contains: raw };
  }
}

/** "Tổng" row's numeric value for one column, from the server-computed grand totals. */
function totalsValue(
  key: DailySummaryDetailColumnKey,
  totals: { amount: number; pointsUsed: number; pointsValue: number } | undefined,
): number | undefined {
  if (!totals) return undefined;
  if (key === DailySummaryDetailColumnKey.Amount) return totals.amount;
  if (key === DailySummaryDetailColumnKey.PointsUsed) return totals.pointsUsed;
  if (key === DailySummaryDetailColumnKey.PointsValue) return totals.pointsValue;
  return undefined;
}

export function DailySummaryDetailModal({
  category,
  issuedAt,
  cashierId,
  salespersonId,
  onClose,
}: DailySummaryDetailModalProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterOperators, setFilterOperators] = useState<Record<string, FilterOperatorEnum>>({});
  const [documentType, setDocumentType] = useState(ALL_VALUE);

  useEffect(() => {
    setPage(1);
    setFilters({});
    setFilterOperators({});
    setDocumentType(ALL_VALUE);
  }, [category]);

  const config = category ? DAILY_SUMMARY_DETAIL_CONFIG[category] : null;
  const documentTypeOptions = category ? (DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES[category] ?? []) : [];

  // Debounce only typed values so a request doesn't fire per keystroke; the
  // Loại chứng từ select applies immediately (a discrete pick, not typing).
  const debouncedFilters = useDebounce(filters, 300);

  const columnFilters = useMemo<ColumnFilter[]>(() => {
    if (!config) return [];
    const list: ColumnFilter[] = [];
    if (documentType) {
      list.push({ col: DailySummaryDetailColumnKey.DocumentType, equals: documentType });
    }
    for (const key of config.columns) {
      if (!FILTERABLE_KEYS.has(key)) continue;
      const raw = debouncedFilters[key]?.trim();
      if (!raw) continue;
      const numeric = DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS.has(key);
      const op = filterOperators[key] ?? (numeric ? FilterOperatorEnum.EQUALS : FilterOperatorEnum.CONTAINS);
      const filter = toColumnFilter(key, op, numeric, raw);
      if (filter) list.push(filter);
    }
    return list;
  }, [config, debouncedFilters, filterOperators, documentType]);

  const body: PosDailySummaryDetailBody = {
    issuedAt,
    category: category ?? PosDailySummaryDetailCategory.RevenueCash,
    cashierId: cashierId ?? undefined,
    salespersonId: salespersonId ?? undefined,
    columnFilters: columnFilters.length ? columnFilters : undefined,
    page,
    limit: DAILY_SUMMARY_DETAIL_DEFAULT_PAGE_SIZE,
  };
  const query = useDailySummaryDetailQuery(body, category !== null);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totals = query.data?.totals;
  const totalPages = Math.max(1, Math.ceil(total / DAILY_SUMMARY_DETAIL_DEFAULT_PAGE_SIZE));

  const columns = useMemo<PosDataTableColumn<PosDailySummaryDetailRow>[]>(() => {
    if (!config) return [];
    return config.columns.map((key) => {
      const numeric = DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS.has(key);
      let filterRender: PosDataTableColumn<PosDailySummaryDetailRow>["filterRender"];
      if (key === DailySummaryDetailColumnKey.DocumentType) {
        filterRender = (
          <PosSelect<string>
            value={documentType}
            onChange={(next) => {
              setDocumentType(next);
              setPage(1);
            }}
            items={[ALL_VALUE, ...documentTypeOptions]}
            itemKey={(v) => v}
            renderItem={(v) => v || "Tất cả"}
            renderSelected={(v) => v || "Tất cả"}
            variant="underline"
            size="sm"
            className="w-full"
            menuMinWidth={220}
          />
        );
      } else if (FILTERABLE_KEYS.has(key)) {
        filterRender = (
          <PosDataTableFilterCell
            value={filters[key] ?? ""}
            onChange={(next) => {
              setFilters((prev) => ({ ...prev, [key]: next }));
              setPage(1);
            }}
            operatorType={numeric ? FilterOperatorTypeEnum.NUMBER : FilterOperatorTypeEnum.TEXT}
            leadingOperator={numeric ? FilterOperatorEnum.EQUALS : FilterOperatorEnum.CONTAINS}
            operator={filterOperators[key] ?? (numeric ? FilterOperatorEnum.EQUALS : FilterOperatorEnum.CONTAINS)}
            onOperatorChange={(op) => {
              setFilterOperators((prev) => ({ ...prev, [key]: op }));
              setPage(1);
            }}
            align={numeric ? "right" : "left"}
          />
        );
      }
      return {
        key,
        title: DAILY_SUMMARY_DETAIL_COLUMN_LABELS[key],
        align: numeric ? "right" : "left",
        cellClassName: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: (row: PosDailySummaryDetailRow) => cellText(row, key),
        filterRender,
      };
    });
  }, [config, filters, filterOperators, documentType, documentTypeOptions]);

  const summaryRow = useMemo(() => {
    if (!config) return undefined;
    return (
      <tr className="h-11 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
        {config.columns.map((key, i) => {
          const value = totalsValue(key, totals);
          return (
            <td
              key={key}
              className={cn(
                "whitespace-nowrap px-3",
                DAILY_SUMMARY_DETAIL_NUMERIC_COLUMNS.has(key) ? "text-right tabular-nums" : "text-left",
              )}
            >
              {i === 0 ? "Tổng" : value !== undefined ? formatNumberVi(value) : ""}
            </td>
          );
        })}
      </tr>
    );
  }, [config, totals]);

  return (
    <PosDialog open={category !== null} onClose={onClose} width={960}>
      <PosDialog.Header title={config?.title ?? ""} />
      <PosDialog.Body className="p-0">
        <div className="max-h-[60vh] overflow-auto">
          <PosDataTable<PosDailySummaryDetailRow>
            columns={columns}
            dataSource={rows}
            rowKey={(row) => `${row.documentNumber}-${row.issuedAt}`}
            emptyText={query.isLoading ? "Đang tải..." : "Không có dữ liệu"}
            summaryRow={summaryRow}
          />
        </div>
        <PosPaginationBar
          page={page}
          totalPages={totalPages}
          pageSize={DAILY_SUMMARY_DETAIL_DEFAULT_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRefresh={() => void query.refetch()}
        />
      </PosDialog.Body>
      <PosDialog.Footer onCancel={onClose} cancelLabel="Đóng" />
    </PosDialog>
  );
}
