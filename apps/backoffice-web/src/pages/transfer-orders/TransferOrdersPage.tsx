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
import { CheckCircle, Eye, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { LookupField } from "../../components/forms/LookupField";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

type TOStatus = "DRAFT" | "APPROVED" | "EXECUTED" | "CANCELLED";

const STATUS_LABEL: Record<TOStatus, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  EXECUTED: "Đã thực hiện",
  CANCELLED: "Đã huỷ",
};

interface TOLine {
  id: string;
  itemId: string;
  requestedQty: string | number;
  note?: string;
  item?: { id: string; code: string; name: string; unit: string };
}

interface TransferOrder {
  id: string;
  documentNumber?: string;
  status: TOStatus;
  sourceBranchId: string;
  destinationBranchId: string;
  sourceStorageId?: string | null;
  destinationStorageId?: string | null;
  requestedDate?: string | null;
  notes?: string;
  lines: TOLine[];
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface Branch {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export function TransferOrdersPage() {
  const [records, setRecords] = useState<PaginatedResponse<TransferOrder> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewing, setViewing] = useState<TransferOrder | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<TransferOrder | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<TransferOrder>>(
        `/inventory/transfer-orders?${params}`,
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

  const handleApprove = async (to: TransferOrder) => {
    setActionLoading(to.id);
    try {
      await apiClient.post(`/inventory/transfer-orders/${to.id}/approve`);
      toast.success("Đã duyệt lệnh điều chuyển.");
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (to: TransferOrder) => {
    setActionLoading(to.id);
    try {
      await apiClient.delete(`/inventory/transfer-orders/${to.id}`);
      toast.success("Đã huỷ lệnh.");
      setConfirmCancel(null);
      if (selectedId === to.id) setSelectedId(null);
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
      label: "Tạo lệnh",
      icon: Plus,
      onClick: () => setCreateOpen(true),
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => selected && setViewing(selected),
    },
    {
      id: "approve",
      label: "Duyệt",
      icon: CheckCircle,
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && void handleApprove(selected),
    },
    {
      id: "cancel",
      label: "Huỷ",
      icon: Trash2,
      variant: "danger",
      disabled:
        !selected ||
        selected.status === "EXECUTED" ||
        selected.status === "CANCELLED",
      onClick: () => selected && setConfirmCancel(selected),
    },
    { id: "sep", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
  ];

  const columns: TableColumn<TransferOrder>[] = [
    {
      key: "createdAt",
      label: "Ngày tạo",
      width: 130,
      render: (r) => new Date(r.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số lệnh",
      width: 150,
      render: (r) =>
        r.documentNumber ?? (
          <span className="italic text-muted-foreground">—</span>
        ),
    },
    {
      key: "route",
      label: "Tuyến chuyển",
      render: (r) => `${r.sourceBranchId.slice(0, 8)} → ${r.destinationBranchId.slice(0, 8)}`,
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
      width: 90,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => r.lines.length,
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
        title="Lệnh điều chuyển"
        tabs={<InventoryTabBar activeId="transfer-order" />}
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
          emptyLabel="Chưa có lệnh điều chuyển."
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
        <CreateTransferOrderDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            await loadRecords();
          }}
        />
      )}

      {viewing && (
        <ViewTransferOrderDialog
          order={viewing}
          onClose={() => setViewing(null)}
        />
      )}

      {confirmCancel && (
        <ConfirmActionModal
          title="Huỷ lệnh điều chuyển"
          message="Xác nhận huỷ lệnh này?"
          confirmLabel="Huỷ"
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

interface DraftLine {
  rowKey: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  requestedQty: number;
  note: string;
}

function CreateTransferOrderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceBranchId, setSourceBranchId] = useState<string>("");
  const [destBranchId, setDestBranchId] = useState<string>("");
  const [requestedDate, setRequestedDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerNonce, setPickerNonce] = useState(0);
  const [pickerValue, setPickerValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<PaginatedResponse<Branch>>(
          "/branches?page=1&pageSize=100",
        );
        if (!cancelled) setBranches(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8" });
    if (query.trim()) params.set("search", query.trim());
    const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  const addLine = (item: InventoryItem) => {
    if (lines.some((l) => l.itemId === item.id)) {
      toast.error(`"${item.code}" đã có trong danh sách.`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        rowKey: `pending-${item.id}-${Date.now()}`,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        requestedQty: 1,
        note: "",
      },
    ]);
    setPickerValue("");
    setPickerNonce((n) => n + 1);
  };

  const handleSave = async () => {
    if (!sourceBranchId || !destBranchId) {
      toast.error("Chọn chi nhánh nguồn và đích.");
      return;
    }
    if (sourceBranchId === destBranchId) {
      toast.error("Chi nhánh nguồn và đích phải khác nhau.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/inventory/transfer-orders", {
        sourceBranchId,
        destinationBranchId: destBranchId,
        requestedDate: requestedDate || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          requestedQty: Number(l.requestedQty),
          note: l.note || undefined,
        })),
      });
      toast.success("Đã tạo lệnh điều chuyển.");
      onCreated();
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
      title="Tạo lệnh điều chuyển"
      defaultWidth={780}
      defaultHeight={620}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || lines.length === 0}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {saving ? "Đang lưu…" : "Tạo lệnh"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Từ chi nhánh *">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sourceBranchId}
              onChange={(e) => setSourceBranchId(e.target.value)}
            >
              <option value="">— Chọn —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Đến chi nhánh *">
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={destBranchId}
              onChange={(e) => setDestBranchId(e.target.value)}
            >
              <option value="">— Chọn —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Ngày mong muốn">
          <Input
            type="date"
            value={requestedDate}
            onChange={(e) => setRequestedDate(e.target.value)}
          />
        </FormField>

        <FormField label="Ghi chú">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>

        <div className="space-y-2">
          <div className="text-sm font-medium">Chi tiết hàng yêu cầu</div>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="border-b border-r px-3 py-1.5 text-left w-[120px]">Mã</th>
                <th className="border-b border-r px-3 py-1.5 text-left">Tên hàng</th>
                <th className="border-b border-r px-3 py-1.5 text-left w-[70px]">ĐVT</th>
                <th className="border-b border-r px-3 py-1.5 text-right w-[120px]">SL</th>
                <th className="border-b px-3 py-1.5 text-center w-[50px]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.rowKey} className="border-b">
                  <td className="border-r px-3 py-1 font-mono text-xs">{l.itemCode}</td>
                  <td className="border-r px-3 py-1">{l.itemName}</td>
                  <td className="border-r px-3 py-1">{l.unit}</td>
                  <td className="border-r px-1 py-1">
                    <Input
                      type="number"
                      min={0.001}
                      className="h-7 text-right"
                      value={String(l.requestedQty)}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((p, i) =>
                            i === idx
                              ? { ...p, requestedQty: Number(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      type="button"
                      aria-label="Xoá dòng"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        setLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="px-2 py-1.5">
                  <LookupField
                    key={pickerNonce}
                    placeholder="Tìm mã hoặc tên hàng để thêm…"
                    value={pickerValue}
                    onValueChange={setPickerValue}
                    onSelect={addLine}
                    search={searchItems}
                    itemKey={(it) => it.id}
                    renderItem={(it) => it.name}
                    renderMeta={(it) => `${it.code} · ${it.unit}`}
                    columns={[
                      { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
                      { key: "name", label: "Tên", render: (it) => it.name },
                    ]}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppModal>
  );
}

// ─── View dialog ────────────────────────────────────────────────────────────

function ViewTransferOrderDialog({
  order,
  onClose,
}: {
  order: TransferOrder;
  onClose: () => void;
}) {
  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Lệnh điều chuyển ${order.documentNumber ?? order.id.slice(0, 8)}`}
      defaultWidth={780}
      defaultHeight={520}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Từ chi nhánh</div>
            <div>{order.sourceBranchId}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Đến chi nhánh</div>
            <div>{order.destinationBranchId}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Trạng thái</div>
            <div>{STATUS_LABEL[order.status]}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ngày mong muốn</div>
            <div>{order.requestedDate ?? "—"}</div>
          </div>
        </div>

        {order.notes ? (
          <div>
            <div className="text-xs text-muted-foreground">Ghi chú</div>
            <div className="text-sm">{order.notes}</div>
          </div>
        ) : null}

        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="border-b border-r px-3 py-1.5 text-left">Mã SKU</th>
              <th className="border-b border-r px-3 py-1.5 text-left">Tên hàng hóa</th>
              <th className="border-b border-r px-3 py-1.5 text-left">ĐVT</th>
              <th className="border-b px-3 py-1.5 text-right">SL yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="border-r px-3 py-1 font-mono text-xs">
                  {l.item?.code ?? l.itemId.slice(0, 8)}
                </td>
                <td className="border-r px-3 py-1">{l.item?.name ?? "—"}</td>
                <td className="border-r px-3 py-1">{l.item?.unit ?? "—"}</td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {Number(l.requestedQty).toLocaleString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppModal>
  );
}
