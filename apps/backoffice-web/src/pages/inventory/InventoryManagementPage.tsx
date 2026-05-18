import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  formatMoneyInteger,
  type ToolbarItem,
} from "@erp/ui";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

interface StockBalanceRow {
  id: string;
  itemId: string;
  locationId: string;
  quantity: number;
  lastMovementAt?: string | null;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    isActive: boolean;
    isPosVisible: boolean;
    categoryName: string | null;
  };
  location: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName: string;
  };
  threshold: {
    minQty: number | null;
    maxQty: number | null;
  };
  belowMin: boolean;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface StorageOption {
  id: string;
  name: string;
  branchId: string;
}

export function InventoryManagementPage() {
  const [rows, setRows] = useState<StockBalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [storageFilter, setStorageFilter] = useState<string>("");
  const [belowMinOnly, setBelowMinOnly] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [storages, setStorages] = useState<StorageOption[]>([]);

  const loadStorages = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<StorageOption>>(
        "/inventory/storages?page=1&pageSize=200",
      );
      setStorages(data.data);
    } catch {
      // best-effort
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (storageFilter) params.set("storageId", storageFilter);
      if (search.trim()) params.set("search", search.trim());
      if (belowMinOnly) params.set("belowMin", "true");
      const { data } = await apiClient.get<PaginatedResponse<StockBalanceRow>>(
        `/inventory/stock/balances?${params}`,
      );
      setRows(data.data);
      setTotal(data.total);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, storageFilter, search, belowMinOnly]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalQuantity = useMemo(
    () => rows.reduce((s, r) => s + Number(r.quantity || 0), 0),
    [rows],
  );

  const columns: TableColumn<StockBalanceRow>[] = [
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 140,
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
      key: "categoryName",
      label: "Nhóm hàng",
      width: 160,
      render: (r) => r.item.categoryName ?? "—",
    },
    {
      key: "storageName",
      label: "Kho",
      width: 180,
      render: (r) => r.location.storageName,
    },
    {
      key: "locationName",
      label: "Vị trí",
      width: 140,
      render: (r) => (
        <span>
          {r.location.code}
          {r.location.name && r.location.name !== r.location.code ? (
            <span className="ml-1 text-xs text-muted-foreground">
              ({r.location.name})
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
      key: "quantity",
      label: "Tồn",
      width: 100,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => (
        <span className={r.belowMin ? "text-destructive font-medium" : undefined}>
          {Number(r.quantity).toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      key: "minQty",
      label: "Min",
      width: 80,
      headerClassName: "text-right",
      className: "text-right tabular-nums text-muted-foreground",
      render: (r) => (r.threshold.minQty == null ? "—" : Number(r.threshold.minQty).toLocaleString("vi-VN")),
    },
    {
      key: "maxQty",
      label: "Max",
      width: 80,
      headerClassName: "text-right",
      className: "text-right tabular-nums text-muted-foreground",
      render: (r) => (r.threshold.maxQty == null ? "—" : Number(r.threshold.maxQty).toLocaleString("vi-VN")),
    },
    {
      key: "lastMovementAt",
      label: "Cập nhật gần nhất",
      width: 150,
      className: "text-muted-foreground",
      render: (r) =>
        r.lastMovementAt
          ? new Date(r.lastMovementAt).toLocaleDateString("vi-VN")
          : "—",
    },
  ];

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void load(),
      disabled: loading,
    },
  ];

  return (
    <DocumentListShell
      title="Tổng hợp tồn kho"
      tabs={<InventoryTabBar activeId="stock-summary" />}
      toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <Input
              type="search"
              placeholder="Tìm mã hoặc tên hàng…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64"
            />
            <Button type="submit" variant="outline" size="sm">
              Tìm
            </Button>
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              >
                Xoá
              </Button>
            ) : null}
          </form>

          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={storageFilter}
            onChange={(e) => {
              setStorageFilter(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
          >
            <option value="">Tất cả kho</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={belowMinOnly}
              onChange={(e) => {
                setBelowMinOnly(e.target.checked);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
            />
            Chỉ hàng dưới min
          </label>
        </div>
      }
      summary={
        <div className="flex items-center justify-end gap-6 px-2">
          <span className="text-muted-foreground">Tổng số dòng:</span>
          <span className="text-base font-semibold tabular-nums">
            {total.toLocaleString("vi-VN")}
          </span>
          <span className="text-muted-foreground">Tổng tồn (trang này):</span>
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
          search || storageFilter || belowMinOnly
            ? "Không tìm thấy dòng tồn kho phù hợp."
            : "Chưa có dữ liệu tồn kho."
        }
        getRowKey={(r) => r.id}
      />
    </DocumentListShell>
  );
}
