import { useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  PeriodFilter,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, CloudDownload, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  searchStockSummary,
  downloadStockSummaryExport,
  type StockSummaryExportVariant,
  type StockStateFilter,
  type StockSummaryQuery,
  type StockSummaryRow,
} from "../../api/stock-summary";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useStorageOptions } from "../../hooks/use-filter-options";
import {
  DEFAULT_ADVANCED_FILTERS,
  StockSummaryFilterDialog,
  type StockSummaryAdvancedFilters,
} from "./_components/StockSummaryFilterDialog";
import { StockDetailDrawer } from "./_components/StockDetailDrawer";

interface AppliedFilters {
  search: string;
  period: PeriodValue;
  advanced: StockSummaryAdvancedFilters;
  requestVersion: number;
}

interface SelectedStockItem {
  id: string;
  code: string;
  name: string;
  storageId: string;
}

const STOCK_SUMMARY_FILTER_KEYS = [
  "itemCode",
  "itemName",
  "unit",
  "category",
  "brand",
  "storage",
  "quantity",
  "openingQty",
  "inQty",
  "outQty",
  "transferOutQty",
  "incomingQty",
] as const;

type StockSummaryFilterKey = (typeof STOCK_SUMMARY_FILTER_KEYS)[number];

const STOCK_SUMMARY_SEARCH: V2SearchConfig = {
  path: "/v2/inventory/stock/summary/search",
  fields: {
    itemCode: "string",
    itemName: "string",
    unit: "string",
    category: "string",
    brand: "string",
    storage: "string",
    quantity: "compare",
    openingQty: "compare",
    inQty: "compare",
    outQty: "compare",
    transferOutQty: "compare",
    incomingQty: "compare",
  },
};

function createColumnFilters(): Record<StockSummaryFilterKey, ColumnFilter> {
  return STOCK_SUMMARY_FILTER_KEYS.reduce(
    (filters, key) => {
      filters[key] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return filters;
    },
    {} as Record<StockSummaryFilterKey, ColumnFilter>,
  );
}

function toBoolParam(
  value: StockSummaryAdvancedFilters["isActive"],
): boolean | undefined {
  if (value === "TRUE") return true;
  if (value === "FALSE") return false;
  return undefined;
}

function toStockState(value: StockStateFilter): StockStateFilter | undefined {
  return value === "ALL" ? undefined : value;
}

function createInitialPeriod(): PeriodValue {
  return { preset: "this_month", ...resolvePeriodRange("this_month") };
}

export function InventoryManagementPage() {
  const initialPeriod = useMemo(createInitialPeriod, []);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [draftPeriod, setDraftPeriod] = useState<PeriodValue>(initialPeriod);
  const [searchInput, setSearchInput] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>({
    search: "",
    period: initialPeriod,
    advanced: DEFAULT_ADVANCED_FILTERS,
    requestVersion: 0,
  });
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState(createColumnFilters);
  const debouncedColumnFilters = useDebouncedValue(columnFilters, 300);
  const [selectedItem, setSelectedItem] = useState<SelectedStockItem | null>(
    null,
  );
  const [exportingVariant, setExportingVariant] =
    useState<StockSummaryExportVariant | null>(null);

  const { options: storageOptions } = useStorageOptions({ withAll: false });

  const query = useMemo<StockSummaryQuery>(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: applied.search.trim() || undefined,
      storageId: applied.advanced.storageId || undefined,
      categoryId: applied.advanced.categoryId || undefined,
      brand: applied.advanced.brand || undefined,
      unit: applied.advanced.unit || undefined,
      isActive: toBoolParam(applied.advanced.isActive),
      isPosVisible: toBoolParam(applied.advanced.isPosVisible),
      stockState: toStockState(applied.advanced.stockState),
      startDate: applied.period.from || undefined,
      endDate: applied.period.to || undefined,
      movementFrom: applied.advanced.movementFrom || undefined,
      movementTo: applied.advanced.movementTo || undefined,
      excludeReservations: applied.advanced.excludeReservations,
    }),
    [applied, pagination.page, pagination.pageSize],
  );

  const searchBody = useMemo(() => {
    const body = buildV2Body(
      STOCK_SUMMARY_SEARCH,
      debouncedColumnFilters,
      pagination.page,
      pagination.pageSize,
    );
    return {
      ...body,
      search: query.search,
      storageId: query.storageId,
      categoryId: query.categoryId,
      brand:
        body.brand ??
        (query.brand ? { operator: "=", value: query.brand } : undefined),
      unit:
        body.unit ??
        (query.unit ? { operator: "=", value: query.unit } : undefined),
      isActive: query.isActive,
      isPosVisible: query.isPosVisible,
      stockState: query.stockState,
      startDate: query.startDate,
      endDate: query.endDate,
      movementFrom: query.movementFrom,
      movementTo: query.movementTo,
      excludeReservations: query.excludeReservations,
    };
  }, [debouncedColumnFilters, pagination.page, pagination.pageSize, query]);

  const summaryQuery = useQuery({
    queryKey: ["stock-summary-v2", searchBody, applied.requestVersion],
    queryFn: () => searchStockSummary(searchBody),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (summaryQuery.error) {
      toast.error(getUserFacingApiErrorMessage(summaryQuery.error));
    }
  }, [summaryQuery.error]);

  const dateInvalid = Boolean(
    draftPeriod.from && draftPeriod.to && draftPeriod.from > draftPeriod.to,
  );

  const applyFilters = () => {
    if (dateInvalid) return;
    setPagination((previous) => ({ ...previous, page: 1 }));
    setApplied((previous) => ({
      ...previous,
      search: searchInput,
      period: draftPeriod,
      requestVersion: previous.requestVersion + 1,
    }));
  };

  const applyAdvanced = (advanced: StockSummaryAdvancedFilters) => {
    setPagination((previous) => ({ ...previous, page: 1 }));
    setApplied((previous) => ({
      ...previous,
      advanced,
      requestVersion: previous.requestVersion + 1,
    }));
    setFilterDialogOpen(false);
  };

  const response = summaryQuery.isError ? undefined : summaryQuery.data;
  const rows = response?.data ?? [];
  const total = response?.total ?? 0;

  const visibleTotals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          quantity:
            sum.quantity +
            displayStockQuantity(row, applied.advanced.excludeReservations),
          openingQty: sum.openingQty + row.openingQty,
          inQty: sum.inQty + row.inQty,
          outQty: sum.outQty + row.outQty,
          transferOutQty: sum.transferOutQty + row.transferOutQty,
          incomingQty: sum.incomingQty + row.incomingQty,
        }),
        {
          quantity: 0,
          openingQty: 0,
          inQty: 0,
          outQty: 0,
          transferOutQty: 0,
          incomingQty: 0,
        },
      ),
    [applied.advanced.excludeReservations, rows],
  );

  const columns = useMemo<TableColumn<StockSummaryRow>[]>(
    () => [
      {
        key: "itemCode",
        label: "Mã SKU",
        width: 160,
        render: (row) => (
          <span className="font-mono text-xs">{row.item.code}</span>
        ),
      },
      {
        key: "itemName",
        label: "Tên hàng hóa",
        width: 220,
        render: (row) => (
          <span className="text-primary-blue hover:underline">
            {row.item.name}
            {!row.item.isActive ? (
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                Ngừng
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 100,
        render: (row) => row.item.unit,
      },
      {
        key: "category",
        label: "Nhóm hàng hóa",
        width: 180,
        render: (row) => row.item.categoryName ?? "",
      },
      {
        key: "brand",
        label: "Thương hiệu",
        width: 160,
        render: (row) => row.item.brand ?? "",
      },
      {
        key: "storage",
        label: "Kho",
        width: 200,
        render: (row) => row.storage.name,
      },
      quantityColumn(
        "quantity",
        "SL tồn",
        applied.advanced.excludeReservations
          ? visibleTotals.quantity
          : (response?.totalQuantity ?? visibleTotals.quantity),
        (row) => displayStockQuantity(row, applied.advanced.excludeReservations),
      ),
      quantityColumn("openingQty", "Tồn đầu kỳ", visibleTotals.openingQty),
      quantityColumn("inQty", "SL nhập", visibleTotals.inQty),
      quantityColumn("outQty", "SL xuất", visibleTotals.outQty),
      quantityColumn(
        "transferOutQty",
        "Đang chuyển đi",
        visibleTotals.transferOutQty,
      ),
      quantityColumn("incomingQty", "Sắp nhận về", visibleTotals.incomingQty),
    ],
    [applied.advanced.excludeReservations, response?.totalQuantity, visibleTotals],
  );

  const activeAdvancedCount = [
    applied.advanced.brand,
    applied.advanced.unit,
    applied.advanced.isActive !== "ALL" ? "x" : "",
    applied.advanced.isPosVisible !== "ALL" ? "x" : "",
    applied.advanced.stockState !== "ALL" ? "x" : "",
    applied.advanced.storageId,
    applied.advanced.categoryId,
    applied.advanced.movementFrom,
    applied.advanced.movementTo,
    applied.advanced.excludeReservations ? "x" : "",
  ].filter(Boolean).length;

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setPagination((previous) => ({ ...previous, page: 1 }));
        setColumnFilters((previous) => ({
          ...previous,
          [key]: { ...previous[key as StockSummaryFilterKey], mode },
        }));
      },
      onValueChange: (key: string, value: string) => {
        setPagination((previous) => ({ ...previous, page: 1 }));
        setColumnFilters((previous) => ({
          ...previous,
          [key]: { ...previous[key as StockSummaryFilterKey], value },
        }));
      },
    }),
    [columnFilters],
  );

  const handleExport = async (variant: StockSummaryExportVariant) => {
    try {
      setExportingVariant(variant);
      await downloadStockSummaryExport(variant, searchBody);
      toast.success("Đã tải tệp tổng hợp tồn kho");
    } catch (error) {
      toast.error(await getStockSummaryExportErrorMessage(error));
    } finally {
      setExportingVariant(null);
    }
  };

  return (
    <DocumentListShell
      title={<InventoryPageTitle>Tổng hợp tồn kho</InventoryPageTitle>}
      tabs={<InventoryTabBar activeId="stock-summary" />}
      filters={
        <div className="flex flex-col gap-3">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters();
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <PeriodFilter
                value={draftPeriod}
                onChange={setDraftPeriod}
                onApply={applyFilters}
                hideApply
              />
            </div>

            <div className="flex items-center gap-3">
              <Button type="button" onClick={() => setFilterDialogOpen(true)}>
                Bộ lọc
                {activeAdvancedCount > 0 ? (
                  <span className="ml-1.5 rounded-full bg-primary-foreground px-1.5 text-[10px] font-semibold leading-4 text-primary">
                    {activeAdvancedCount}
                  </span>
                ) : null}
              </Button>
              <Input
                type="search"
                placeholder="Nhập mã hàng hóa, tên hàng hóa..."
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-10 flex-1"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={dateInvalid || summaryQuery.isFetching}
              >
                <Filter className="mr-1.5 h-4 w-4" />
                Lấy dữ liệu
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={rows.length === 0 || exportingVariant !== null}
                  >
                    {exportingVariant ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <CloudDownload className="mr-1.5 h-4 w-4" />
                    )}
                    Xuất khẩu
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[310px]">
                  {STOCK_SUMMARY_EXPORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.variant}
                      disabled={exportingVariant !== null}
                      onSelect={() => void handleExport(option.variant)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </form>

          <div className="flex items-center gap-2 pb-1">
            {dateInvalid ? (
              <span className="ml-auto text-xs text-destructive">
                Ngày bắt đầu phải trước ngày kết thúc.
              </span>
            ) : null}
          </div>
        </div>
      }
      pagination={
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={total}
          onPageChange={(page) =>
            setPagination((previous) => ({ ...previous, page }))
          }
          onPageSizeChange={(pageSize) =>
            setPagination((previous) => ({ ...previous, page: 1, pageSize }))
          }
          onRefresh={() => void summaryQuery.refetch()}
        />
      }
    >
      <BaseDataTable
        columns={columns}
        rows={rows}
        loading={summaryQuery.isLoading}
        emptyLabel={
          applied.search || activeAdvancedCount > 0
            ? "Không có dữ liệu tồn kho phù hợp với bộ lọc."
            : "Chưa có dữ liệu tồn kho."
        }
        getRowKey={(row) => `${row.itemId}:${row.storageId}`}
        columnFilterControl={columnFilterControl}
        onRowClick={(row) => {
          if (row.storageId.startsWith("pending:")) return;
          setSelectedItem({
            id: row.item.id,
            code: row.item.code,
            name: row.item.name,
            storageId: row.storageId,
          });
        }}
      />
      <StockSummaryFilterDialog
        open={filterDialogOpen}
        initial={applied.advanced}
        onCancel={() => setFilterDialogOpen(false)}
        onApply={applyAdvanced}
        storageOptions={storageOptions}
      />
      <StockDetailDrawer
        item={selectedItem}
        period={applied.period}
        onClose={() => setSelectedItem(null)}
      />
    </DocumentListShell>
  );
}

function quantityColumn(
  key: keyof StockSummaryRow,
  label: string,
  total: number,
  valueOf: (row: StockSummaryRow) => number = (row) => Number(row[key] ?? 0),
): TableColumn<StockSummaryRow> {
  return {
    key,
    label,
    width: 130,
    filterKind: "number-range",
    headerClassName: "text-right",
    className: "text-right tabular-nums",
    render: (row) => formatMoneyInteger(valueOf(row)),
    footer: (
      <span className="block text-right font-semibold tabular-nums">
        {formatMoneyInteger(total)}
      </span>
    ),
  };
}

function displayStockQuantity(
  row: StockSummaryRow,
  excludeReservations: boolean,
): number {
  return row.quantity - (excludeReservations ? row.reservedQty : 0);
}

const STOCK_SUMMARY_EXPORT_OPTIONS: Array<{
  variant: StockSummaryExportVariant;
  label: string;
}> = [
  { variant: "MODEL_AND_VARIANTS", label: "Xuất khẩu mẫu mã và thuộc tính chi tiết" },
  { variant: "VARIANTS", label: "Xuất khẩu thuộc tính chi tiết" },
  { variant: "SPLIT_ATTRIBUTES", label: "Xuất khẩu thuộc tính, tách riêng cột thuộc tính" },
  { variant: "MODELS", label: "Xuất khẩu mẫu mã" },
];

async function getStockSummaryExportErrorMessage(error: unknown): Promise<string> {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    (error as { response?: { data?: unknown } }).response?.data instanceof Blob
  ) {
    try {
      const body = JSON.parse(
        await (error as { response: { data: Blob } }).response.data.text(),
      ) as { message?: unknown };
      if (typeof body.message === "string") return body.message;
    } catch {
      // Fall through to the shared API error mapper.
    }
  }
  return getUserFacingApiErrorMessage(error);
}
