import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  type ToolbarItem,
} from "@erp/ui";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { LookupField } from "../../components/forms/LookupField";
import { InventoryTabBar } from "../../components/document/inventoryTabs";

interface ItemSearchResult {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface BalanceRow {
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
    categoryName: string | null;
  };
  location: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName: string;
  };
  threshold: { minQty: number | null; maxQty: number | null };
  belowMin: boolean;
}

interface LedgerEntry {
  id: string;
  itemId: string;
  locationId: string;
  movementType: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  notes?: string;
  createdAt: string;
}

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: "Nhập kho",
  SALE_ISSUE: "Bán hàng",
  RETURN_IN: "Trả về kho",
  EXCHANGE_IN: "Đổi vào",
  EXCHANGE_OUT: "Đổi ra",
  TRANSFER_IN: "Chuyển vào",
  TRANSFER_OUT: "Chuyển đi",
  ADJUSTMENT_INCREASE: "Điều chỉnh +",
  ADJUSTMENT_DECREASE: "Điều chỉnh -",
  GOODS_ISSUE: "Xuất kho",
};

export function ItemLocationDetailsPage() {
  const [itemId, setItemId] = useState("");
  const [itemLabel, setItemLabel] = useState("");
  const [pickedItem, setPickedItem] = useState<ItemSearchResult | null>(null);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "10" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<ItemSearchResult>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  const load = useCallback(async () => {
    if (!itemId) {
      setBalances([]);
      setLedger([]);
      return;
    }
    setLoading(true);
    try {
      const [{ data: bal }, { data: led }] = await Promise.all([
        apiClient.get<PaginatedResponse<BalanceRow>>(
          `/inventory/stock/balances?page=1&pageSize=100&itemId=${itemId}`,
        ),
        apiClient.get<PaginatedResponse<LedgerEntry>>(
          `/inventory/stock/ledger?page=1&pageSize=20&itemId=${itemId}`,
        ),
      ]);
      setBalances(bal.data);
      setLedger(led.data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setBalances([]);
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalQty = useMemo(
    () => balances.reduce((s, b) => s + Number(b.quantity || 0), 0),
    [balances],
  );

  const balanceColumns: TableColumn<BalanceRow>[] = [
    {
      key: "storage",
      label: "Kho",
      width: 200,
      render: (r) => r.location.storageName,
    },
    {
      key: "location",
      label: "Vị trí",
      width: 160,
      render: (r) => (
        <span>
          {r.location.code}
          {r.location.name !== r.location.code ? (
            <span className="ml-1 text-xs text-muted-foreground">({r.location.name})</span>
          ) : null}
        </span>
      ),
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
      render: (r) =>
        r.threshold.minQty == null
          ? "—"
          : Number(r.threshold.minQty).toLocaleString("vi-VN"),
    },
    {
      key: "maxQty",
      label: "Max",
      width: 80,
      headerClassName: "text-right",
      className: "text-right tabular-nums text-muted-foreground",
      render: (r) =>
        r.threshold.maxQty == null
          ? "—"
          : Number(r.threshold.maxQty).toLocaleString("vi-VN"),
    },
    {
      key: "lastMovement",
      label: "Biến động gần nhất",
      width: 160,
      className: "text-muted-foreground",
      render: (r) =>
        r.lastMovementAt
          ? new Date(r.lastMovementAt).toLocaleString("vi-VN")
          : "—",
    },
  ];

  const ledgerColumns: TableColumn<LedgerEntry>[] = [
    {
      key: "createdAt",
      label: "Thời gian",
      width: 160,
      render: (r) => new Date(r.createdAt).toLocaleString("vi-VN"),
    },
    {
      key: "movementType",
      label: "Loại biến động",
      width: 160,
      render: (r) => MOVEMENT_LABEL[r.movementType] ?? r.movementType,
    },
    {
      key: "quantity",
      label: "Số lượng",
      width: 100,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => (
        <span className={Number(r.quantity) < 0 ? "text-destructive" : "text-emerald-600"}>
          {Number(r.quantity) > 0 ? "+" : ""}
          {Number(r.quantity).toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      key: "reference",
      label: "Chứng từ",
      render: (r) => (
        <span className="text-xs">
          {r.referenceType}{" "}
          <span className="text-muted-foreground">#{r.referenceId.slice(0, 8)}</span>
        </span>
      ),
    },
    {
      key: "notes",
      label: "Ghi chú",
      render: (r) => r.notes ?? "",
    },
  ];

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void load(),
      disabled: loading || !itemId,
    },
  ];

  return (
    <DocumentListShell
      title="Chi tiết vị trí hàng hóa"
      tabs={<InventoryTabBar activeId="item-location-details" />}
      toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
      filters={
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[420px]">
            <LookupField
              placeholder="Chọn hàng hóa…"
              value={itemLabel}
              onValueChange={(v) => {
                setItemLabel(v);
                if (!v) {
                  setItemId("");
                  setPickedItem(null);
                }
              }}
              onSelect={(it) => {
                setItemId(it.id);
                setItemLabel(`${it.code} · ${it.name}`);
                setPickedItem(it);
              }}
              search={searchItems}
              itemKey={(it) => it.id}
              renderItem={(it) => it.name}
              renderMeta={(it) => `${it.code} · ${it.unit}`}
              columns={[
                { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
                { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
                { key: "unit", label: "ĐVT", className: "w-[60px]", render: (it) => it.unit },
              ]}
            />
          </div>
          {pickedItem ? (
            <div className="text-sm text-muted-foreground">
              ĐVT: <strong className="text-foreground">{pickedItem.unit}</strong>
              <span className="mx-3">·</span>
              Tổng tồn ở mọi vị trí:{" "}
              <strong className="text-foreground tabular-nums">
                {totalQty.toLocaleString("vi-VN")}
              </strong>
            </div>
          ) : null}
        </div>
      }
    >
      {!itemId ? (
        <div className="flex flex-1 items-center justify-center py-20 text-sm text-muted-foreground">
          Chọn 1 hàng hóa ở trên để xem tồn theo từng vị trí.
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Tồn theo vị trí
            </h3>
            <BaseDataTable
              columns={balanceColumns}
              rows={balances}
              loading={loading}
              emptyLabel="Hàng hóa này chưa có tồn ở vị trí nào."
              getRowKey={(r) => r.id}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Biến động gần đây (20 dòng mới nhất)
            </h3>
            <BaseDataTable
              columns={ledgerColumns}
              rows={ledger}
              loading={loading}
              emptyLabel="Chưa có biến động."
              getRowKey={(r) => r.id}
            />
          </section>
        </div>
      )}
    </DocumentListShell>
  );
}
