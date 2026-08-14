import { useEffect, useMemo, useState } from "react";
import {
  Button,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { CloudUpload, Printer, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../../../components/table/pagination.dto";
import { ReportFilterPopover, withDefaults } from "./ReportFilterDialog";
import { ColumnConfigDialog, type ColumnConfigEntry } from "./ColumnConfigDialog";
import { StorageReportSelect } from "./StorageReportSelect";
import {
  type FilterField,
  type FilterValues,
  type SubtitleSegment,
} from "./types";

export interface StorageReportShellProps<T> {
  title: string;
  /**
   * Stable key used to persist the column visibility/freeze/order config
   * in localStorage. Should be unique per report (e.g. the route path).
   */
  storageKey: string;
  filterFields: FilterField[];
  buildSubtitle: (values: FilterValues) => SubtitleSegment[];
  columns: TableColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyLabel?: string;
  /**
   * Per-column footer values aligned with the column layout. The returned
   * map is merged into each column as `column.footer`, so reordering the
   * columns automatically reorders the footer cells.
   *
   * In server mode the second argument carries the API's whole-set totals and
   * `rows` is only the current page — format from `totals`, never from `rows`,
   * or the footer goes back to describing one page.
   */
  columnSummary?: (
    rows: T[],
    totals?: Record<string, number>,
  ) => Record<string, React.ReactNode>;
  getRowKey: (row: T, index: number) => string;
  initialPeriod?: PeriodValue;
  onApply?: (values: FilterValues, period: PeriodValue) => void;
  /** Row count of the whole filtered set, from the API. */
  total?: number;
  /** Whole-set column totals from the API — the only source for the footer. */
  totals?: Record<string, number>;
  /** Fires whenever the page, page size or a column filter changes. */
  onQueryChange?: (state: {
    page: number;
    pageSize: number;
    columnFilters: Record<string, ColumnFilter>;
  }) => void;
}

function buildDefaultColumnConfig<T>(
  columns: TableColumn<T>[],
): ColumnConfigEntry[] {
  return columns.map((c) => ({
    key: c.key,
    label: c.label,
    visible: true,
    frozen: !!c.frozen,
  }));
}

function loadStoredConfig(
  storageKey: string,
  defaults: ColumnConfigEntry[],
): ColumnConfigEntry[] {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as ColumnConfigEntry[];
    if (!Array.isArray(parsed)) return defaults;
    // Merge: keep stored order/visibility/freeze for known keys, append any
    // newly added columns at the end with default values, drop unknown keys.
    const known = new Map(defaults.map((d) => [d.key, d]));
    const merged: ColumnConfigEntry[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      const def = known.get(entry.key);
      if (!def) continue;
      merged.push({
        key: entry.key,
        label: def.label,
        visible: typeof entry.visible === "boolean" ? entry.visible : def.visible,
        frozen: typeof entry.frozen === "boolean" ? entry.frozen : def.frozen,
      });
      seen.add(entry.key);
    }
    for (const def of defaults) {
      if (!seen.has(def.key)) merged.push(def);
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function StorageReportShell<T>({
  title,
  storageKey,
  filterFields,
  buildSubtitle,
  columns,
  rows,
  loading,
  emptyLabel = "Không có dữ liệu.",
  columnSummary,
  getRowKey,
  initialPeriod,
  onApply,
  total: serverTotal,
  totals: serverTotals,
  onQueryChange,
}: StorageReportShellProps<T>) {
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>(() =>
    withDefaults(filterFields, {}),
  );
  const [period, setPeriod] = useState<PeriodValue>(
    () =>
      initialPeriod ?? {
        preset: "this_month",
        ...resolvePeriodRange("this_month"),
      },
  );
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);

  // Column visibility/freeze/order state — keyed by column key.
  const defaultConfig = useMemo(() => buildDefaultColumnConfig(columns), [columns]);
  const [columnConfig, setColumnConfig] = useState<ColumnConfigEntry[]>(() =>
    loadStoredConfig(storageKey, defaultConfig),
  );

  // Re-merge if `columns` shape changes (new column added, etc.) so we don't
  // lose the user's persisted choices.
  useEffect(() => {
    setColumnConfig((prev) => {
      const known = new Map(defaultConfig.map((d) => [d.key, d]));
      const merged: ColumnConfigEntry[] = [];
      const seen = new Set<string>();
      for (const entry of prev) {
        const def = known.get(entry.key);
        if (!def) continue;
        merged.push({ ...entry, label: def.label });
        seen.add(entry.key);
      }
      for (const def of defaultConfig) {
        if (!seen.has(def.key)) merged.push(def);
      }
      return merged;
    });
  }, [defaultConfig]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(columnConfig));
    } catch {
      // Quota / disabled storage — ignore.
    }
  }, [storageKey, columnConfig]);

  // Project the original `columns` through the user's config: order, visibility,
  // and frozen flag. Footer cells are merged in from `columnSummary`.
  // Note: summary depends on `filteredRows` declared below — use a ref-style
  // approach by wiring this useMemo *after* filtering is computed.

  // Computed below after filteredRows is known.

  const handleColumnResize = (key: string, nextWidth: number) => {
    setColumnConfig((prev) =>
      prev.map((c) => (c.key === key ? { ...c, width: nextWidth } : c)),
    );
  };

  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilter>>(
    () =>
      Object.fromEntries(
        columns.map((c) => [c.key, { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" }]),
      ),
  );

  const subtitle = useMemo(() => buildSubtitle(filterValues), [buildSubtitle, filterValues]);

  // Page, page size and column filters all live on the server, so the page
  // component has to refetch whenever any of them moves.
  useEffect(() => {
    onQueryChange?.({
      page: pagination.page,
      pageSize: pagination.pageSize,
      columnFilters,
    });
    // `onQueryChange` is intentionally not a dependency: pages pass an inline
    // callback, and depending on it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.pageSize, columnFilters]);

  // Rows arrive already filtered and already paged. The shell used to filter
  // and slice them here, which is exactly why the footer could only ever
  // describe the page in view — and why anything past row 200 never rendered.
  const total = serverTotal ?? 0;
  const pagedRows = rows;

  // The footer reads the API's whole-set totals. There is deliberately no
  // fallback to summing `rows`: that fallback is the bug this replaced, and it
  // would look right on any dataset small enough to fit one page.
  const summaryMap = useMemo(
    () => (columnSummary && serverTotals ? columnSummary(rows, serverTotals) : null),
    [columnSummary, rows, serverTotals],
  );

  const effectiveColumns = useMemo<TableColumn<T>[]>(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const out: TableColumn<T>[] = [];
    for (const cfg of columnConfig) {
      if (!cfg.visible) continue;
      const base = byKey.get(cfg.key);
      if (!base) continue;
      out.push({
        ...base,
        frozen: cfg.frozen,
        width: cfg.width ?? base.width,
        footer: summaryMap ? summaryMap[cfg.key] ?? null : base.footer,
      });
    }
    return out;
  }, [columnConfig, columns, summaryMap]);

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key]: { ...(prev[key] ?? { mode, value: "" }), mode },
        }));
        setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
      },
      onValueChange: (key: string, value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key]: { ...(prev[key] ?? { mode: DEFAULT_COLUMN_FILTER_MODE, value }), value },
        }));
        // A narrower filter can leave the current page beyond the last one —
        // the user would see an empty grid and read it as "no data".
        setPagination((p) => (p.page === 1 ? p : { ...p, page: 1 }));
      },
    }),
    [columnFilters],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Top bar: filter button (left) — title + subtitle (center) */}
      <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-start gap-4 border-b px-4 py-3">
        <div className="flex gap-2 flex-col">
          {/* Dropdown chọn báo cáo kho (tạm thời cho store view). */}
          <div className="w-[250px]">
            <StorageReportSelect />
          </div>
          <div>
            <ReportFilterPopover
              fields={filterFields}
              value={filterValues}
              onSubmit={(next) => {
                setFilterValues(next);
                setPagination((p) => ({ ...p, page: 1 }));
                const periodField = filterFields.find((f) => f.type === "period");
                const nextPeriod =
                  periodField && (next[periodField.key] as PeriodValue | undefined);
                if (nextPeriod) setPeriod(nextPeriod);
                onApply?.(next, nextPeriod ?? period);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center text-center">
          <h1 className="text-lg font-semibold uppercase tracking-wide text-primary">
            {title}
          </h1>
          {subtitle.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {subtitle.map((seg, i) => (
                <span key={i}>
                  {seg.label}: <strong className="text-foreground">{seg.value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>

        <div />
      </div>

      {/* Period filter row (with In / Xuất khẩu / Cấu hình on the right) */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
        <PeriodFilter
          value={period}
          onChange={(nextPeriod) => {
            setPeriod(nextPeriod);
            // Keep the dialog's period field in sync so it reflects the toolbar value when opened.
            const periodField = filterFields.find((f) => f.type === "period");
            if (periodField) {
              setFilterValues((prev) => ({ ...prev, [periodField.key]: nextPeriod }));
            }
          }}
          onApply={() => onApply?.(filterValues, period)}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Tính năng in báo cáo sẽ được bổ sung.")}
          >
            <Printer className="mr-1 h-4 w-4" /> In
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Tính năng xuất khẩu sẽ được bổ sung.")}
          >
            <CloudUpload className="mr-1 h-4 w-4" /> Xuất khẩu
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setColumnConfigOpen(true)}
            aria-label="Cấu hình cột"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <BaseDataTable
            columns={effectiveColumns}
            rows={pagedRows}
            loading={!!loading}
            emptyLabel={emptyLabel}
            getRowKey={getRowKey}
            columnFilterControl={columnFilterControl}
            onColumnResize={handleColumnResize}
          />
        </div>
        <div className="shrink-0 border-t bg-background px-4 py-1.5 text-sm">
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
          />
        </div>
      </div>

      <ColumnConfigDialog
        open={columnConfigOpen}
        onOpenChange={setColumnConfigOpen}
        reportTitle={title}
        value={columnConfig}
        defaults={defaultConfig}
        onSave={setColumnConfig}
      />
    </div>
  );
}
