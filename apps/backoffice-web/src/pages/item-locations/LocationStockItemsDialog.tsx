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
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { LookupField } from "../../components/forms/LookupField";
import {
  QuickCreateItemDialog,
  type QuickItem,
} from "../../components/forms/QuickCreateDialogs";

interface Props {
  locationId: string;
  fallbackTitle?: string;
  onClose: () => void;
}

interface PendingItem {
  /** Local ID for keying; not sent to server. */
  rowKey: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  categoryName: string | null;
}

interface ItemSearchResult {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryName?: string | null;
}

interface PaginatedItems {
  data: ItemSearchResult[];
  total: number;
}

export function LocationStockItemsDialog({
  locationId,
  fallbackTitle,
  onClose,
}: Props) {
  const [data, setData] = useState<StockByLocationItem[]>([]);
  const [meta, setMeta] = useState<StockByLocationResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [pending, setPending] = useState<PendingItem[]>([]);
  const [pickerValue, setPickerValue] = useState("");
  const [pickerNonce, setPickerNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<StockByLocationItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("search", search.trim());
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
  }, [locationId, page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    if (query.trim()) params.set("search", query.trim());
    const { data: res } = await apiClient.get<PaginatedItems>(
      `/inventory/items?${params}`,
    );
    return res.data;
  }, []);

  const existingItemIds = useMemo(
    () => new Set(data.map((d) => d.itemId)),
    [data],
  );
  const pendingItemIds = useMemo(
    () => new Set(pending.map((p) => p.itemId)),
    [pending],
  );

  const addPending = useCallback(
    (item: { id: string; code: string; name: string; unit: string; categoryName?: string | null }) => {
      if (existingItemIds.has(item.id)) {
        toast.error(`"${item.code}" đã có tại vị trí này.`);
        return;
      }
      if (pendingItemIds.has(item.id)) {
        toast.error(`"${item.code}" đã được thêm vào danh sách chờ.`);
        return;
      }
      setPending((prev) => [
        ...prev,
        {
          rowKey: `pending-${item.id}-${Date.now()}`,
          itemId: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          categoryName: item.categoryName ?? null,
        },
      ]);
      // Reset the picker so user can add the next item.
      setPickerValue("");
      setPickerNonce((n) => n + 1);
    },
    [existingItemIds, pendingItemIds],
  );

  const removePending = useCallback((rowKey: string) => {
    setPending((prev) => prev.filter((p) => p.rowKey !== rowKey));
  }, []);

  const handleSave = useCallback(async () => {
    if (pending.length === 0) return;
    setSaving(true);
    try {
      // Sequential to surface first-failure with clearer error message.
      for (const p of pending) {
        await apiClient.post(`/inventory/locations/${locationId}/stock-items`, {
          itemId: p.itemId,
        });
      }
      toast.success(`Đã thêm ${pending.length} hàng hóa vào vị trí.`);
      setPending([]);
      await load();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [pending, locationId, load]);

  const handleRemoveExisting = useCallback(async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await apiClient.delete(
        `/inventory/locations/${locationId}/stock-items/${confirmRemove.itemId}`,
      );
      toast.success(`Đã bỏ "${confirmRemove.code}" khỏi vị trí.`);
      setConfirmRemove(null);
      await load();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setRemoving(false);
    }
  }, [confirmRemove, locationId, load]);

  const requestClose = () => {
    if (pending.length > 0) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const columns: TableColumn<StockByLocationItem>[] = useMemo(
    () => [
      { key: "code", label: "Mã SKU", width: 140, render: (r) => r.code },
      {
        key: "name",
        label: "Tên hàng hóa",
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
        width: 180,
        render: (r) => r.categoryName ?? "—",
      },
      {
        key: "quantity",
        label: "Tồn",
        width: 100,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (r) => (
          <span className={r.belowMin ? "text-destructive font-medium" : undefined}>
            {Number(r.quantity).toLocaleString("vi-VN")}
          </span>
        ),
      },
      {
        key: "_actions",
        label: "",
        width: 50,
        render: (r) => (
          <button
            type="button"
            aria-label="Bỏ khỏi vị trí"
            title={
              Number(r.quantity) !== 0
                ? "Chỉ bỏ được khi tồn = 0"
                : "Bỏ khỏi vị trí"
            }
            className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={Number(r.quantity) !== 0}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmRemove(r);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [],
  );

  const title = meta?.location
    ? `${meta.location.storage.name} - ${meta.location.code}`
    : fallbackTitle ?? "Danh sách hàng hóa";

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      title="Danh sách hàng hóa"
      defaultWidth={960}
      defaultHeight={660}
      showFooter={false}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="text-center text-sm font-medium text-muted-foreground">
          {title}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
        >
          <Input
            type="search"
            placeholder="Tìm mã hoặc tên hàng hóa…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="max-w-sm"
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
                setPage(1);
              }}
            >
              Xoá lọc
            </Button>
          ) : null}
        </form>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
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

              {!loading && data.length === 0 && pending.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    Vị trí này chưa có hàng hóa nào.
                  </td>
                </tr>
              ) : null}

              {data.map((row) => (
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

              {pending.map((row) => (
                <tr key={row.rowKey} className="border-b bg-amber-50/60">
                  <td className="border-r px-3 py-1.5">{row.code}</td>
                  <td className="border-r px-3 py-1.5">
                    {row.name}
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900">
                      Mới
                    </span>
                  </td>
                  <td className="border-r px-3 py-1.5">{row.unit}</td>
                  <td className="border-r px-3 py-1.5">{row.categoryName ?? "—"}</td>
                  <td className="border-r px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    0
                  </td>
                  <td className="border-r px-3 py-1.5">
                    <button
                      type="button"
                      aria-label="Bỏ khỏi danh sách chờ"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                      onClick={() => removePending(row.rowKey)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Picker row */}
              <tr className="border-b">
                <td className="px-2 py-1.5" colSpan={columns.length}>
                  <LookupField
                    key={pickerNonce}
                    placeholder="Tìm mã hoặc tên hàng hóa để thêm…"
                    value={pickerValue}
                    onValueChange={setPickerValue}
                    onSelect={(it) => addPending(it)}
                    search={searchItems}
                    itemKey={(it) => it.id}
                    renderItem={(it) => it.name}
                    renderMeta={(it) => `${it.code} · ${it.unit}`}
                    columns={[
                      { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
                      { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
                      { key: "unit", label: "ĐVT", className: "w-[80px]", render: (it) => it.unit },
                    ]}
                    onCreateNew={() => setQuickCreateOpen(true)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-muted-foreground">
            Số dòng = {(meta?.total ?? 0) + pending.length}
            {pending.length > 0 ? (
              <span className="ml-2 text-amber-700">
                · {pending.length} dòng chưa lưu
              </span>
            ) : null}
          </span>
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={meta?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            onRefresh={() => void load()}
          />
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="button"
            disabled={saving || pending.length === 0}
            onClick={() => void handleSave()}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "Đang lưu…" : `Lưu${pending.length > 0 ? ` (${pending.length})` : ""}`}
          </Button>
          <Button type="button" variant="outline" onClick={requestClose}>
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmActionModal
          title="Bỏ hàng hóa khỏi vị trí"
          message={`Xác nhận bỏ "${confirmRemove.code} - ${confirmRemove.name}" khỏi vị trí này?`}
          confirmLabel="Bỏ"
          cancelLabel="Huỷ"
          loading={removing}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={handleRemoveExisting}
        />
      )}

      {confirmClose && (
        <ConfirmActionModal
          title="Đóng mà không lưu?"
          message={`${pending.length} dòng chưa lưu sẽ bị bỏ qua. Tiếp tục đóng?`}
          confirmLabel="Đóng"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() => {
            setConfirmClose(false);
            setPending([]);
            onClose();
          }}
        />
      )}

      <QuickCreateItemDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(item: QuickItem) => {
          setQuickCreateOpen(false);
          addPending({
            id: item.id,
            code: item.code,
            name: item.name,
            unit: item.unit,
            categoryName: null,
          });
        }}
      />
    </AppModal>
  );
}
