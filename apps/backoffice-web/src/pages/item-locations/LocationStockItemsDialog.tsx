import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal, Button, Input } from "@erp/ui";
import { Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type {
  StockByLocationItem,
  StockByLocationResponse,
} from "@erp/shared-interfaces";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { type TableColumn } from "../../components/table/BaseDataTable";
import { ColumnFilterModeDropdown } from "../../components/table/ColumnFilterModeControl";
import { PaginationControls } from "../../components/table/PaginationControls";
import type {
  ColumnFilter,
  ColumnFilterMode,
} from "../../components/table/pagination.dto";

interface Props {
  locationId: string;
  fallbackTitle?: string;
  onClose: () => void;
}

type FilterKey =
  | "itemCode"
  | "itemName"
  | "unit"
  | "categoryName"
  | "locationCode"
  | "locationName"
  | "quantityMax";

const TEXT_FILTER_KEYS = [
  "itemCode",
  "itemName",
  "unit",
  "categoryName",
] as const;

const INITIAL_FILTERS: Record<FilterKey, ColumnFilter> = {
  itemCode: { mode: "contains", value: "" },
  itemName: { mode: "contains", value: "" },
  unit: { mode: "contains", value: "" },
  categoryName: { mode: "contains", value: "" },
  locationCode: { mode: "contains", value: "" },
  locationName: { mode: "contains", value: "" },
  quantityMax: { mode: "contains", value: "" },
};

function matchesTextFilter(source: string, filter: ColumnFilter): boolean {
  const actual = source.toLocaleLowerCase("vi-VN");
  const expected = filter.value.trim().toLocaleLowerCase("vi-VN");
  if (!expected) return true;

  switch (filter.mode) {
    case "equals":
      return actual === expected;
    case "startsWith":
      return actual.startsWith(expected);
    case "endsWith":
      return actual.endsWith(expected);
    case "notContains":
      return !actual.includes(expected);
    case "contains":
    default:
      return actual.includes(expected);
  }
}

export function LocationStockItemsDialog({
  locationId,
  fallbackTitle,
  onClose,
}: Props) {
  const [data, setData] = useState<StockByLocationItem[]>([]);
  const [meta, setMeta] = useState<StockByLocationResponse["meta"] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] =
    useState<Record<FilterKey, ColumnFilter>>(INITIAL_FILTERS);
  const [committedFilters, setCommittedFilters] = useState(filters);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCommittedFilters(filters);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      for (const key of TEXT_FILTER_KEYS) {
        const filter = committedFilters[key];
        const value = filter.value.trim();
        if (value) {
          params.set(key, value);
          params.set(`${key}Mode`, filter.mode);
        }
      }
      const quantityMax = committedFilters.quantityMax.value.trim();
      if (quantityMax) {
        params.set("quantityMax", quantityMax);
      }
      const { data: res } = await apiClient.get<StockByLocationResponse>(
        `/inventory/locations/${locationId}/stock-items?${params}`,
      );
      setData(res.data);
      setMeta(res.meta);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setData([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [committedFilters, locationId, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const locationMatchesFilters = useMemo(() => {
    if (!meta) return true;
    return (
      matchesTextFilter(meta.location.code, filters.locationCode) &&
      matchesTextFilter(meta.location.name, filters.locationName)
    );
  }, [filters.locationCode, filters.locationName, meta]);

  const updateFilterValue = useCallback((key: FilterKey, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  }, []);

  const updateFilterMode = useCallback(
    (key: FilterKey, mode: ColumnFilterMode) => {
      setFilters((prev) => ({
        ...prev,
        [key]: { ...prev[key], mode },
      }));
    },
    [],
  );

  const visibleData = useMemo(() => {
    if (!locationMatchesFilters) return [];
    return data.filter((row) => !pendingDeleteIds.has(row.itemId));
  }, [data, locationMatchesFilters, pendingDeleteIds]);

  const visibleTotal = locationMatchesFilters
    ? Math.max(0, (meta?.total ?? 0) - pendingDeleteIds.size)
    : 0;

  const markForDelete = useCallback((itemId: string) => {
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (pendingDeleteIds.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        [...pendingDeleteIds].map((itemId) =>
          apiClient.delete(
            `/inventory/locations/${locationId}/stock-items/${itemId}`,
          ),
        ),
      );
      toast.success(`Đã bỏ ${pendingDeleteIds.size} hàng hóa khỏi vị trí.`);
      setPendingDeleteIds(new Set());
      await load();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [load, locationId, pendingDeleteIds]);

  const columns: TableColumn<StockByLocationItem>[] = useMemo(
    () => [
      {
        key: "code",
        label: "Mã SKU",
        width: 170,
        className: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: (r) => r.code,
      },
      {
        key: "name",
        label: "Tên hàng hóa",
        width: 360,
        className: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: (r) => (
          <span>
            {r.name}
            {r.variantLabel ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({r.variantLabel})
              </span>
            ) : null}
          </span>
        ),
      },
      { key: "unit", label: "ĐVT", width: 80, render: (r) => r.unit },
      {
        key: "categoryName",
        label: "Nhóm hàng hóa",
        width: 220,
        className: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: (r) => r.categoryName ?? "—",
      },
      {
        key: "locationCode",
        label: "Mã vị trí",
        width: 160,
        className: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: () => meta?.location.code ?? "—",
      },
      {
        key: "locationName",
        label: "Tên vị trí",
        width: 220,
        className: "whitespace-nowrap",
        headerClassName: "whitespace-nowrap",
        render: () => meta?.location.name ?? "—",
      },
      {
        key: "quantity",
        label: "Số lượng",
        width: 120,
        className: "whitespace-nowrap text-right tabular-nums",
        headerClassName: "whitespace-nowrap text-right",
        render: (r) => (
          <span
            className={r.belowMin ? "text-destructive font-medium" : undefined}
          >
            {Number(r.quantity).toLocaleString("vi-VN")}
          </span>
        ),
      },
      {
        key: "_actions",
        label: "",
        width: 56,
        render: (r) => (
          <button
            type="button"
            aria-label={`Bỏ ${r.code} khỏi vị trí`}
            title="Đánh dấu bỏ khỏi vị trí"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-destructive hover:bg-destructive/10"
            onClick={() => markForDelete(r.itemId)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [markForDelete, meta?.location.code, meta?.location.name],
  );

  const title = meta?.location
    ? `${meta.location.storage.name} - ${meta.location.code}`
    : (fallbackTitle ?? "Danh sách hàng hóa");

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Danh sách hàng hóa"
      defaultWidth={960}
      defaultHeight={660}
      footer={
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
            disabled={pendingDeleteIds.size === 0 || saving}
            onClick={() => void handleSave()}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div className="py-1 text-center text-lg font-semibold uppercase text-foreground">
          {title}
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[1400px] border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width } : undefined}
                    className={`border-b border-r px-3 py-2 text-left font-medium ${c.headerClassName ?? ""}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr>
                {columns.map((c) => {
                  if (c.key === "_actions") {
                    return <th key={c.key} className="border-b border-r" />;
                  }
                  const keyByColumn: Record<string, keyof typeof filters> = {
                    code: "itemCode",
                    name: "itemName",
                    unit: "unit",
                    categoryName: "categoryName",
                    locationCode: "locationCode",
                    locationName: "locationName",
                    quantity: "quantityMax",
                  };
                  const filterKey = keyByColumn[c.key];
                  return (
                    <th key={c.key} className="border-b border-r p-0">
                      <div className="flex h-9 items-stretch">
                        {c.key === "quantity" ? (
                          <span className="flex w-9 shrink-0 items-center justify-center border-r text-xs font-normal">
                            ≤
                          </span>
                        ) : (
                          <ColumnFilterModeDropdown
                            fieldLabel={c.label}
                            value={filters[filterKey].mode}
                            onChange={(mode) =>
                              updateFilterMode(filterKey, mode)
                            }
                            triggerClassName="h-9 w-9 rounded-none border-0 border-r shadow-none"
                          />
                        )}
                        <Input
                          value={filters[filterKey].value}
                          onChange={(e) =>
                            updateFilterValue(filterKey, e.target.value)
                          }
                          inputMode={
                            c.key === "quantity" ? "decimal" : undefined
                          }
                          className="h-9 rounded-none border-0 shadow-none focus-visible:ring-1"
                          aria-label={`Lọc ${c.label}`}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    Đang tải…
                  </td>
                </tr>
              ) : null}

              {!loading && visibleData.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    Vị trí này chưa có hàng hóa nào.
                  </td>
                </tr>
              ) : null}

              {visibleData.map((row) => (
                <tr key={row.itemId} className="border-b">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border-r px-3 py-1.5 ${c.className ?? ""}`}
                    >
                      {c.render ? c.render(row) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t py-3 text-sm">
          <span className="text-muted-foreground">
            Số dòng = {visibleTotal}
            {pendingDeleteIds.size > 0 ? (
              <span className="ml-2 text-destructive">
                · {pendingDeleteIds.size} dòng chờ xóa
              </span>
            ) : null}
          </span>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={visibleTotal}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            onRefresh={() => void load()}
          />
        </div>
      </div>
    </AppModal>
  );
}
