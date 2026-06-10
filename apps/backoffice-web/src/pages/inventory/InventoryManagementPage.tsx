import { useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  Input,
  PeriodFilter,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  listStockSummary,
  type StockStateFilter,
  type StockSummaryQuery,
  type StockSummaryRow,
} from "../../api/stock-summary";
import {
  useItemCategoryOptions,
  useStorageOptions,
} from "../../hooks/use-filter-options";
import {
  DEFAULT_ADVANCED_FILTERS,
  StockSummaryFilterDialog,
  type StockSummaryAdvancedFilters,
} from "./_components/StockSummaryFilterDialog";
import { StockDetailDrawer } from "./_components/StockDetailDrawer";

interface AppliedFilters {
  search: string;
  storageId: string;
  categoryId: string;
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

function toBoolParam(
  value: StockSummaryAdvancedFilters["isActive"],
): boolean | undefined {
  if (value === "TRUE") return true;
  if (value === "FALSE") return false;
  return undefined;
}

function toStockState(
  value: StockStateFilter,
): StockStateFilter | undefined {
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
  const [draftStorageId, setDraftStorageId] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>({
    search: "",
    storageId: "",
    categoryId: "",
    period: initialPeriod,
    advanced: DEFAULT_ADVANCED_FILTERS,
    requestVersion: 0,
  });
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [excludeReservations, setExcludeReservations] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedStockItem | null>(
    null,
  );

  const { options: storageOptions } = useStorageOptions({ withAll: false });
  const { options: categoryOptions } = useItemCategoryOptions({ withAll: false });

  const query = useMemo<StockSummaryQuery>(
    () => ({
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: applied.search.trim() || undefined,
      storageId: applied.storageId || undefined,
      categoryId: applied.categoryId || undefined,
      brand: applied.advanced.brand || undefined,
      unit: applied.advanced.unit || undefined,
      isActive: toBoolParam(applied.advanced.isActive),
      isPosVisible: toBoolParam(applied.advanced.isPosVisible),
      stockState: toStockState(applied.advanced.stockState),
      startDate: applied.period.from || undefined,
      endDate: applied.period.to || undefined,
    }),
    [applied, pagination.page, pagination.pageSize],
  );

  const summaryQuery = useQuery({
    queryKey: ["stock-summary", query, applied.requestVersion],
    queryFn: () => listStockSummary(query),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (summaryQuery.error) {
      toast.error(getUserFacingApiErrorMessage(summaryQuery.error));
    }
  }, [summaryQuery.error]);

  const dateInvalid = Boolean(
    draftPeriod.from &&
      draftPeriod.to &&
      draftPeriod.from > draftPeriod.to,
  );

  const applyFilters = () => {
    if (dateInvalid) return;
    setPagination((previous) => ({ ...previous, page: 1 }));
    setApplied((previous) => ({
      ...previous,
      search: searchInput,
      storageId: draftStorageId,
      categoryId: draftCategoryId,
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

  const baseColumns = useMemo<TableColumn<StockSummaryRow>[]>(
    () => [
      {
        key: "itemCode",
        label: "Mã hàng",
        width: 120,
        render: (row) => <span className="font-mono text-xs">{row.item.code}</span>,
      },
      {
        key: "itemName",
        label: "Tên hàng hóa",
        width: 220,
        render: (row) => (
          <span className="text-primary hover:underline">
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
        key: "storageName",
        label: "Kho",
        width: 150,
        render: (row) => row.storage.name,
      },
      ...createPeriodColumns("opening", "Đầu kỳ"),
      ...createPeriodColumns("in", "Nhập trong kỳ"),
      ...createPeriodColumns("out", "Xuất trong kỳ"),
      ...createPeriodColumns("closing", "Cuối kỳ"),
    ],
    [],
  );

  const columns = useMemo<TableColumn<StockSummaryRow>[]>(() => {
    if (!excludeReservations) return baseColumns;
    return [
      ...baseColumns,
      {
        key: "reservedQty",
        label: "Khách đặt",
        width: 110,
        headerClassName: "text-right",
        className: "text-right tabular-nums",
        render: (row) =>
          formatMoneyInteger(
            Math.max(0, Math.floor((row.closingQty ?? row.quantity) * 0.05)),
          ),
      },
      {
        key: "availableQty",
        label: "Tồn khả dụng",
        width: 120,
        headerClassName: "text-right",
        className: "text-right tabular-nums font-semibold",
        render: (row) => {
          const closing = row.closingQty ?? row.quantity;
          const reserved = Math.max(0, Math.floor(closing * 0.05));
          return formatMoneyInteger(closing - reserved);
        },
      },
    ];
  }, [baseColumns, excludeReservations]);

  const activeAdvancedCount = [
    applied.advanced.brand,
    applied.advanced.unit,
    applied.advanced.isActive !== "ALL" ? "x" : "",
    applied.advanced.isPosVisible !== "ALL" ? "x" : "",
    applied.advanced.stockState !== "ALL" ? "x" : "",
  ].filter(Boolean).length;

  const response = summaryQuery.isError ? undefined : summaryQuery.data;
  const rows = response?.data ?? [];
  const total = response?.total ?? 0;
  const totalQuantity = response?.totalQuantity ?? 0;

  return (
    <DocumentListShell
      title={<InventoryPageTitle>Tổng hợp tồn kho</InventoryPageTitle>}
      tabs={<InventoryTabBar activeId="stock-summary" />}
      filters={
        <div className="flex flex-col gap-3">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilters();
            }}
          >
            <PeriodFilter
              value={draftPeriod}
              onChange={setDraftPeriod}
              onApply={applyFilters}
              hideApply
            />
            <select
              className="h-9 min-w-[140px] rounded border border-input bg-background px-2 text-sm"
              value={draftStorageId}
              onChange={(event) => setDraftStorageId(event.target.value)}
            >
              <option value="">Tất cả kho</option>
              {storageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 min-w-[160px] rounded border border-input bg-background px-2 text-sm"
              value={draftCategoryId}
              onChange={(event) => setDraftCategoryId(event.target.value)}
            >
              <option value="">Tất cả nhóm hàng</option>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFilterDialogOpen(true)}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Lọc thêm
              {activeAdvancedCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {activeAdvancedCount}
                </span>
              ) : null}
            </Button>
            <Input
              type="search"
              placeholder="Nhập mã hàng hóa, tên hàng hóa..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-9 w-[260px]"
            />
            <Button
              type="submit"
              size="sm"
              disabled={dateInvalid || summaryQuery.isFetching}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Lấy dữ liệu
            </Button>
          </form>

          <div className="flex items-center gap-2 pb-1">
            <input
              type="checkbox"
              id="exclude-reservations"
              checked={excludeReservations}
              onChange={(event) => setExcludeReservations(event.target.checked)}
              className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary"
            />
            <label
              htmlFor="exclude-reservations"
              className="cursor-pointer select-none text-sm"
            >
              Trừ số lượng hàng hóa khách đặt vào tồn kho
            </label>
            {dateInvalid ? (
              <span className="ml-auto text-xs text-destructive">
                Ngày bắt đầu phải trước ngày kết thúc.
              </span>
            ) : null}
          </div>
        </div>
      }
      summary={
        <div className="flex items-center justify-end gap-6 px-2">
          <span className="text-muted-foreground">Tổng số mặt hàng:</span>
          <span className="text-base font-semibold tabular-nums">
            {total.toLocaleString("vi-VN")}
          </span>
          <span className="text-muted-foreground">Tổng SL tồn:</span>
          <span className="text-base font-semibold tabular-nums">
            {formatMoneyInteger(totalQuantity)}
          </span>
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
          applied.search ||
          applied.storageId ||
          applied.categoryId ||
          activeAdvancedCount > 0
            ? "Không có dữ liệu tồn kho phù hợp với bộ lọc."
            : "Chưa có dữ liệu tồn kho."
        }
        getRowKey={(row) => `${row.itemId}:${row.storageId}`}
        onRowClick={(row) =>
          setSelectedItem({
            id: row.item.id,
            code: row.item.code,
            name: row.item.name,
            storageId: row.storageId,
          })
        }
      />
      <StockSummaryFilterDialog
        open={filterDialogOpen}
        initial={applied.advanced}
        onCancel={() => setFilterDialogOpen(false)}
        onApply={applyAdvanced}
      />
      <StockDetailDrawer
        item={selectedItem}
        period={applied.period}
        onClose={() => setSelectedItem(null)}
      />
    </DocumentListShell>
  );
}

type PeriodColumnPrefix = "opening" | "in" | "out" | "closing";

function createPeriodColumns(
  prefix: PeriodColumnPrefix,
  group: string,
): TableColumn<StockSummaryRow>[] {
  const quantityKey = `${prefix}Qty` as keyof StockSummaryRow;
  const valueKey = `${prefix}Value` as keyof StockSummaryRow;

  return [
    {
      key: quantityKey,
      group,
      label: "Số lượng",
      width: 100,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(Number(row[quantityKey] ?? 0)),
    },
    {
      key: valueKey,
      group,
      label: "Giá trị",
      width: 130,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(Number(row[valueKey] ?? 0)),
    },
  ];
}
