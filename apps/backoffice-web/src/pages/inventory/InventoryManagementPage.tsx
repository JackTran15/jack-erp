import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  Input,
  PeriodFilter,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { Filter, RefreshCw, Search } from "lucide-react";
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
  type StockSummaryRow,
} from "../../api/stock-summary";
import {
  DEFAULT_ADVANCED_FILTERS,
  StockSummaryFilterDialog,
  type StockSummaryAdvancedFilters,
} from "./_components/StockSummaryFilterDialog";

function toBoolParam(v: StockSummaryAdvancedFilters["isActive"]): boolean | undefined {
  if (v === "TRUE") return true;
  if (v === "FALSE") return false;
  return undefined;
}

function toStockState(v: StockStateFilter): StockStateFilter | undefined {
  return v === "ALL" ? undefined : v;
}

export function InventoryManagementPage() {
  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [loading, setLoading] = useState(false);

  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });

  // Committed filter state (drives the fetch)
  const [search, setSearch] = useState<string>("");
  const [advanced, setAdvanced] = useState<StockSummaryAdvancedFilters>(
    DEFAULT_ADVANCED_FILTERS,
  );
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });

  // Draft state (UI before "Nạp"/"Tìm")
  const [draftPeriod, setDraftPeriod] = useState<PeriodValue>(period);
  const [searchInput, setSearchInput] = useState<string>("");
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStockSummary({
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: search.trim() || undefined,
        storageId: advanced.storageId || undefined,
        categoryId: advanced.categoryId || undefined,
        brand: advanced.brand || undefined,
        unit: advanced.unit || undefined,
        isActive: toBoolParam(advanced.isActive),
        isPosVisible: toBoolParam(advanced.isPosVisible),
        stockState: toStockState(advanced.stockState),
        movementFrom: period.from || undefined,
        movementTo: period.to || undefined,
      });
      setRows(res.data);
      setTotal(res.total);
      setTotalQuantity(res.totalQuantity);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRows([]);
      setTotal(0);
      setTotalQuantity(0);
    } finally {
      setLoading(false);
    }
  }, [
    pagination.page,
    pagination.pageSize,
    search,
    advanced,
    period.from,
    period.to,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const dateInvalid = useMemo(
    () =>
      Boolean(
        draftPeriod.from &&
          draftPeriod.to &&
          draftPeriod.from > draftPeriod.to,
      ),
    [draftPeriod.from, draftPeriod.to],
  );

  const applyTextAndPeriod = useCallback(() => {
    if (dateInvalid) return;
    setSearch(searchInput);
    setPeriod(draftPeriod);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [dateInvalid, searchInput, draftPeriod]);

  const applyAdvanced = useCallback(
    (next: StockSummaryAdvancedFilters) => {
      setAdvanced(next);
      setPagination((p) => ({ ...p, page: 1 }));
      setFilterDialogOpen(false);
    },
    [],
  );

  const columns: TableColumn<StockSummaryRow>[] = [
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 120,
      render: (r) => <span className="font-mono text-xs">{r.item.code}</span>,
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      render: (r) => (
        <span>
          {r.item.name}
          {!r.item.isActive ? (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Ngừng
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "unit",
      label: "ĐVT",
      width: 70,
      render: (r) => r.item.unit,
    },
    {
      key: "categoryName",
      label: "Nhóm hàng",
      width: 160,
      render: (r) => r.item.categoryName ?? "—",
    },
    {
      key: "brand",
      label: "Thương hiệu",
      width: 140,
      render: (r) => r.item.brand ?? "—",
    },
    {
      key: "storageName",
      label: "Kho",
      width: 200,
      render: (r) => r.storage.name,
    },
    {
      key: "quantity",
      label: "SL tồn",
      width: 100,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => Number(r.quantity).toLocaleString("vi-VN"),
    },
  ];

  const activeAdvancedCount = [
    advanced.storageId,
    advanced.categoryId,
    advanced.brand,
    advanced.unit,
    advanced.isActive !== "ALL" ? "x" : "",
    advanced.isPosVisible !== "ALL" ? "x" : "",
    advanced.stockState !== "ALL" ? "x" : "",
  ].filter(Boolean).length;

  return (
    <DocumentListShell
      title={<InventoryPageTitle>Tổng hợp tồn kho</InventoryPageTitle>}
      tabs={<InventoryTabBar activeId="stock-summary" />}
      filters={
        <div className="flex flex-col gap-2">
          <PeriodFilter
            value={draftPeriod}
            onChange={setDraftPeriod}
            onApply={applyTextAndPeriod}
            hideApply
          />
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applyTextAndPeriod();
            }}
          >
            <Button
              type="button"
              size="sm"
              className="bg-primary-blue text-white hover:bg-primary-blue-hover"
              onClick={() => setFilterDialogOpen(true)}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Bộ lọc
              {activeAdvancedCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-white px-1.5 text-[10px] font-semibold leading-4 text-primary-blue">
                  {activeAdvancedCount}
                </span>
              ) : null}
            </Button>
            <Input
              type="search"
              placeholder="Nhập mã hàng hóa, tên hàng hóa…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-72"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={dateInvalid || loading}
            >
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Tìm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Nạp
            </Button>
            {dateInvalid ? (
              <span className="text-xs text-destructive">
                Ngày bắt đầu phải trước ngày kết thúc.
              </span>
            ) : null}
          </form>
        </div>
      }
      summary={
        <div className="flex items-center justify-end gap-6 px-2">
          <span className="text-muted-foreground">Tổng số dòng:</span>
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
          onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
          onPageSizeChange={(s) =>
            setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
          }
          onRefresh={() => void load()}
        />
      }
    >
      <BaseDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyLabel={
          search || activeAdvancedCount > 0
            ? "Không có dữ liệu tồn kho phù hợp với bộ lọc."
            : "Chưa có dữ liệu tồn kho."
        }
        getRowKey={(r) => `${r.itemId}:${r.storageId}`}
      />
      <StockSummaryFilterDialog
        open={filterDialogOpen}
        initial={advanced}
        onCancel={() => setFilterDialogOpen(false)}
        onApply={applyAdvanced}
      />
    </DocumentListShell>
  );
}
