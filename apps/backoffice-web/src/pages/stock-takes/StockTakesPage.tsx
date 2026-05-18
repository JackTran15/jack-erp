import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppModal,
  Button,
  DocumentListShell,
  FormField,
  Input,
  PageToolbar,
  Textarea,
  type ToolbarItem,
} from "@erp/ui";
import { CheckCircle, Eye, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

type StockTakeStatus = "DRAFT" | "POSTED" | "CANCELLED";

const STATUS_LABEL: Record<StockTakeStatus, string> = {
  DRAFT: "Đang đếm",
  POSTED: "Đã duyệt",
  CANCELLED: "Đã huỷ",
};

interface StockTakeLine {
  id: string;
  itemId: string;
  locationId: string;
  expectedQty: string | number;
  countedQty: string | number | null;
  note?: string | null;
  item?: { id: string; code: string; name: string; unit: string };
  location?: { id: string; code: string; name: string };
}

interface StockTake {
  id: string;
  documentNumber?: string;
  status: StockTakeStatus;
  storageId?: string | null;
  locationId?: string | null;
  snapshotAt: string;
  notes?: string;
  postedAt?: string | null;
  createdAt: string;
  lines: StockTakeLine[];
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

export function StockTakesPage() {
  const [records, setRecords] = useState<PaginatedResponse<StockTake> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<StockTake | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<StockTake | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<StockTake>>(
        `/inventory/stock-takes?${params}`,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const selected = useMemo(
    () => records?.data.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const handleCancel = async (st: StockTake) => {
    setActionLoading(st.id);
    try {
      await apiClient.delete(`/inventory/stock-takes/${st.id}`);
      toast.success("Đã huỷ phiếu kiểm kê.");
      setConfirmCancel(null);
      if (selectedId === st.id) setSelectedId(null);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Tạo phiếu kiểm kê",
      icon: Plus,
      onClick: () => setCreateOpen(true),
    },
    {
      id: "view",
      label: "Đếm / Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => selected && setViewing(selected),
    },
    {
      id: "cancel",
      label: "Huỷ",
      icon: Trash2,
      variant: "danger",
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && setConfirmCancel(selected),
    },
    { id: "sep", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
  ];

  const columns: TableColumn<StockTake>[] = [
    {
      key: "createdAt",
      label: "Ngày tạo",
      width: 130,
      render: (r) => new Date(r.createdAt).toLocaleString("vi-VN"),
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 130,
      render: (r) => STATUS_LABEL[r.status],
    },
    {
      key: "lineCount",
      label: "Số dòng",
      width: 100,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => r.lines?.length ?? 0,
    },
    {
      key: "scope",
      label: "Phạm vi",
      render: (r) =>
        r.locationId
          ? `Vị trí: ${r.locationId.slice(0, 8)}`
          : r.storageId
            ? `Kho: ${r.storageId.slice(0, 8)}`
            : "—",
    },
    {
      key: "notes",
      label: "Ghi chú",
      render: (r) => r.notes ?? "",
    },
  ];

  return (
    <>
      <DocumentListShell
        title="Kiểm kê kho"
        tabs={<InventoryTabBar activeId="stock-take" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
            onRefresh={() => void loadRecords()}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu kiểm kê."
          getRowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (r) => (
              <input
                type="checkbox"
                aria-label="Chọn dòng"
                checked={selectedId === r.id}
                onChange={() =>
                  setSelectedId(selectedId === r.id ? null : r.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      {createOpen && (
        <CreateStockTakeDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async (st) => {
            setCreateOpen(false);
            await loadRecords();
            setViewing(st);
          }}
        />
      )}

      {viewing && (
        <StockTakeCountDialog
          stockTake={viewing}
          onClose={() => {
            setViewing(null);
            void loadRecords();
          }}
        />
      )}

      {confirmCancel && (
        <ConfirmActionModal
          title="Huỷ phiếu kiểm kê"
          message="Xác nhận huỷ phiếu kiểm kê này? Các giá trị đã đếm sẽ bị bỏ."
          confirmLabel="Huỷ phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmCancel.id}
          onCancel={() => setConfirmCancel(null)}
          onConfirm={() => void handleCancel(confirmCancel)}
        />
      )}
    </>
  );
}

// ─── Create dialog ──────────────────────────────────────────────────────────

function CreateStockTakeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (st: StockTake) => void;
}) {
  const [storages, setStorages] = useState<StorageOption[]>([]);
  const [storageId, setStorageId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<PaginatedResponse<StorageOption>>(
          "/inventory/storages?page=1&pageSize=200",
        );
        if (!cancelled) setStorages(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!storageId) {
      toast.error("Vui lòng chọn kho.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await apiClient.post<StockTake>("/inventory/stock-takes", {
        storageId,
        notes: notes || undefined,
      });
      toast.success(`Đã khởi tạo phiếu kiểm kê với ${data.lines.length} dòng.`);
      onCreated(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Tạo phiếu kiểm kê"
      onSave={() => void handleSave()}
      onCancel={onClose}
      saveLabel={saving ? "Đang khởi tạo…" : "Khởi tạo"}
      saveDisabled={saving}
      className="max-w-[480px]"
    >
      <div className="flex flex-col gap-3">
        <FormField label="Kho cần kiểm kê *">
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
          >
            <option value="">— Chọn kho —</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Ghi chú">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </FormField>
        <p className="text-xs text-muted-foreground">
          Hệ thống sẽ tạo snapshot tồn kho hiện tại của các vị trí trong kho đã
          chọn. Bạn có thể nhập số đếm thực tế ở bước kế tiếp.
        </p>
      </div>
    </AppModal>
  );
}

// ─── Count dialog ───────────────────────────────────────────────────────────

function StockTakeCountDialog({
  stockTake,
  onClose,
}: {
  stockTake: StockTake;
  onClose: () => void;
}) {
  const [lines, setLines] = useState(stockTake.lines);
  const [posting, setPosting] = useState(false);
  const [dirtyLines, setDirtyLines] = useState<Set<string>>(new Set());

  const isLocked = stockTake.status !== "DRAFT";

  const handleUpdateCount = async (lineId: string, value: string) => {
    const parsed = value === "" ? null : Number(value);
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, countedQty: parsed as never } : l,
      ),
    );
    setDirtyLines((prev) => new Set(prev).add(lineId));
  };

  const handleSaveLine = async (line: StockTakeLine) => {
    try {
      await apiClient.patch(
        `/inventory/stock-takes/${stockTake.id}/lines/${line.id}`,
        { countedQty: line.countedQty == null ? null : Number(line.countedQty) },
      );
      setDirtyLines((prev) => {
        const next = new Set(prev);
        next.delete(line.id);
        return next;
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  const handlePost = async () => {
    // Save any unsaved lines first
    setPosting(true);
    try {
      for (const lineId of Array.from(dirtyLines)) {
        const line = lines.find((l) => l.id === lineId);
        if (line) await handleSaveLine(line);
      }
      await apiClient.post(`/inventory/stock-takes/${stockTake.id}/post`);
      toast.success("Đã duyệt phiếu kiểm kê — đã tạo điều chỉnh tồn kho.");
      onClose();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const variances = useMemo(
    () =>
      lines
        .filter((l) => l.countedQty != null)
        .map((l) => ({
          id: l.id,
          variance: Number(l.countedQty) - Number(l.expectedQty),
        }))
        .filter((x) => x.variance !== 0),
    [lines],
  );

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Kiểm kê ${stockTake.documentNumber ?? stockTake.id.slice(0, 8)}`}
      defaultWidth={1000}
      defaultHeight={680}
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Số dòng: <strong>{lines.length}</strong>
            <span className="mx-3">·</span>
            Đã đếm: <strong>{lines.filter((l) => l.countedQty != null).length}</strong>
            <span className="mx-3">·</span>
            Lệch: <strong className="text-amber-700">{variances.length}</strong>
          </div>
          <div className="flex items-center gap-2">
            {!isLocked && (
              <Button
                type="button"
                onClick={() => void handlePost()}
                disabled={posting || lines.every((l) => l.countedQty == null)}
              >
                <CheckCircle className="mr-1.5 h-4 w-4" />
                {posting ? "Đang duyệt…" : "Duyệt phiếu"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/40">
              <tr>
                <th className="border-b border-r px-3 py-2 text-left">Mã SKU</th>
                <th className="border-b border-r px-3 py-2 text-left">Tên hàng hóa</th>
                <th className="border-b border-r px-3 py-2 text-left">Vị trí</th>
                <th className="border-b border-r px-3 py-2 text-right">Tồn dự kiến</th>
                <th className="border-b border-r px-3 py-2 text-right w-[140px]">Số đếm</th>
                <th className="border-b px-3 py-2 text-right">Lệch</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const counted = l.countedQty == null ? null : Number(l.countedQty);
                const expected = Number(l.expectedQty);
                const variance = counted == null ? null : counted - expected;
                return (
                  <tr key={l.id} className="border-b">
                    <td className="border-r px-3 py-1.5 font-mono text-xs">
                      {l.item?.code ?? l.itemId.slice(0, 8)}
                    </td>
                    <td className="border-r px-3 py-1.5">{l.item?.name ?? "—"}</td>
                    <td className="border-r px-3 py-1.5">
                      {l.location?.code ?? l.locationId.slice(0, 8)}
                    </td>
                    <td className="border-r px-3 py-1.5 text-right tabular-nums">
                      {expected.toLocaleString("vi-VN")}
                    </td>
                    <td className="border-r px-2 py-1">
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-right"
                        value={l.countedQty == null ? "" : String(l.countedQty)}
                        onChange={(e) => void handleUpdateCount(l.id, e.target.value)}
                        onBlur={() => {
                          if (dirtyLines.has(l.id)) void handleSaveLine(l);
                        }}
                        disabled={isLocked}
                      />
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right tabular-nums ${
                        variance == null
                          ? "text-muted-foreground"
                          : variance === 0
                            ? "text-emerald-600"
                            : "text-destructive font-medium"
                      }`}
                    >
                      {variance == null
                        ? "—"
                        : variance > 0
                          ? `+${variance.toLocaleString("vi-VN")}`
                          : variance.toLocaleString("vi-VN")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppModal>
  );
}
