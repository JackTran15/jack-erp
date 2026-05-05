import { useCallback, useEffect, useRef, useState } from "react";
import { formatClientError } from "@erp/api-client";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AppModal,
  Button,
  formatMoneyInteger,
  Input,
  MoneyInput,
  type ToolbarItem,
} from "@erp/ui";
import { apiClient } from "../../lib/api-axios";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { SearchListingInput } from "../../components/forms/SearchListingInput";
import { TableActionHeader } from "../../components/layout/TableActionHeader";
import { resolveBackofficeBreadcrumbs } from "../../components/layout/breadcrumbs";
import {
  DEFAULT_PAGINATION,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";

type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "RECEIVING" | "RECEIVED" | "CANCELLED";

interface PurchaseOrderLine {
  id: string;
  itemId: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  notes?: string;
}

interface PurchaseOrder {
  id: string;
  documentNumber?: string;
  providerId: string;
  locationId: string;
  status: PurchaseOrderStatus;
  expectedDate?: string;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  lines: PurchaseOrderLine[];
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryProvider {
  id: string;
  name: string;
  code: string;
}

interface InventoryLocation {
  id: string;
  name: string;
  code: string;
  storageId: string;
}

interface InventoryItem {
  id: string;
  name: string;
  code: string;
  unit: string;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  RECEIVING: "Đang nhận",
  RECEIVED: "Đã nhận đủ",
  CANCELLED: "Đã huỷ",
};

const STATUS_COLOR: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-blue-100 text-blue-700",
  RECEIVING: "bg-yellow-100 text-yellow-700",
  RECEIVED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export function PurchaseOrdersPage() {
  const [records, setRecords] = useState<PaginatedResponse<PurchaseOrder> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Detail / form state
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<PurchaseOrder | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiClient.get<PaginatedResponse<PurchaseOrder>>(
        `/inventory/purchase-orders?${params}`,
      );
      setRecords(data);
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [pagination, statusFilter]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const handleApprove = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    try {
      await apiClient.post(`/inventory/purchase-orders/${order.id}/approve`);
      await loadRecords();
      if (selectedOrder?.id === order.id) {
        const { data } = await apiClient.get<PurchaseOrder>(
          `/inventory/purchase-orders/${order.id}`,
        );
        setSelectedOrder(data);
      }
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (order: PurchaseOrder) => {
    setActionLoading(order.id);
    try {
      await apiClient.post(`/inventory/purchase-orders/${order.id}/cancel`);
      setConfirmCancel(null);
      await loadRecords();
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoading(null);
    }
  };

  const columns: TableColumn<PurchaseOrder>[] = [
    {
      key: "documentNumber",
      label: "Số phiếu",
      render: (row) => row.documentNumber ?? <span className="text-muted-foreground italic">Chưa duyệt</span>,
    },
    {
      key: "status",
      label: "Trạng thái",
      render: (row) => (
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      ),
    },
    {
      key: "expectedDate",
      label: "Ngày giao dự kiến",
      render: (row) =>
        row.expectedDate
          ? new Date(row.expectedDate).toLocaleDateString("vi-VN")
          : "-",
    },
    {
      key: "lines",
      label: "Số dòng hàng",
      render: (row) => `${row.lines?.length ?? 0} mặt hàng`,
    },
    {
      key: "createdAt",
      label: "Ngày tạo",
      render: (row) => new Date(row.createdAt).toLocaleDateString("vi-VN"),
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <div className="mb-3">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu đặt hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý phiếu đặt hàng từ nhà cung cấp. Hàng chỉ được nhập kho khi có phiếu đặt hàng đã duyệt.
          </p>
        </div>
      </div>

      <TableActionHeader
        className="mb-4"
        breadcrumbs={resolveBackofficeBreadcrumbs("/inventory/purchase-orders")}
        items={buildPurchaseOrderToolbarItems({
          onCreate: () => setShowCreateForm(true),
        })}
      />

      <div className="mb-4 flex gap-3">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Chưa có phiếu đặt hàng."
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <div className="flex gap-2">
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1 py-0.5"
              onClick={() => setSelectedOrder(row)}
            >
              Chi tiết
            </Button>
            {row.status === "DRAFT" && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5 text-blue-600"
                disabled={actionLoading === row.id}
                onClick={() => void handleApprove(row)}
              >
                Duyệt
              </Button>
            )}
            {(row.status === "APPROVED" || row.status === "RECEIVING") && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5 text-green-600"
                onClick={() => { setSelectedOrder(row); setShowReceiveForm(true); }}
              >
                Nhận hàng
              </Button>
            )}
            {(row.status === "DRAFT" || row.status === "APPROVED") && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5 text-destructive"
                onClick={() => setConfirmCancel(row)}
              >
                Huỷ
              </Button>
            )}
          </div>
        )}
      />

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={records?.total ?? 0}
        onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
      />

      {showCreateForm && (
        <CreatePurchaseOrderModal
          onCancel={() => setShowCreateForm(false)}
          onCreated={async () => {
            setShowCreateForm(false);
            await loadRecords();
          }}
        />
      )}

      {selectedOrder && !showReceiveForm && (
        <PurchaseOrderDetailModal
          order={selectedOrder}
          actionLoading={actionLoading}
          onApprove={() => void handleApprove(selectedOrder)}
          onReceive={() => setShowReceiveForm(true)}
          onCancel={() => setConfirmCancel(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {selectedOrder && showReceiveForm && (
        <ReceiveGoodsModal
          order={selectedOrder}
          onCancel={() => setShowReceiveForm(false)}
          onReceived={async () => {
            setShowReceiveForm(false);
            setSelectedOrder(null);
            await loadRecords();
          }}
        />
      )}

      {confirmCancel && (
        <ConfirmActionModal
          title="Huỷ phiếu đặt hàng"
          message={`Xác nhận huỷ phiếu ${confirmCancel.documentNumber ?? confirmCancel.id}? Thao tác này không thể hoàn tác.`}
          confirmLabel="Huỷ phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmCancel.id}
          onCancel={() => setConfirmCancel(null)}
          onConfirm={() => void handleCancel(confirmCancel)}
        />
      )}
    </div>
  );
}

function buildPurchaseOrderToolbarItems({
  onCreate,
}: {
  onCreate: () => void;
}): ToolbarItem[] {
  return [
    { id: "create", label: "Thêm mới", icon: Plus, onClick: onCreate },
    { id: "duplicate", label: "Nhân bản", icon: Copy, onClick: () => undefined, disabled: true },
    { id: "edit", label: "Sửa", icon: Pencil, onClick: () => undefined, disabled: true },
    { id: "delete", label: "Xoá", icon: Trash2, onClick: () => undefined, disabled: true, variant: "danger" },
  ];
}

// ─── Create Purchase Order Modal ───────────────────────────────────────────────

function CreatePurchaseOrderModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [providerId, setProviderId] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([
    { itemId: "", itemLabel: "", orderedQuantity: 1, unitPrice: 0, notes: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { itemId: "", itemLabel: "", orderedQuantity: 1, unitPrice: 0, notes: "" },
    ]);

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const updateLine = (idx: number, field: string, value: unknown) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

  const searchProviders = useCallback(async (query: string) => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "8",
      search: query.trim(),
    });
    const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
      `/inventory/providers?${params}`,
    );
    return data.data;
  }, []);

  const searchLocations = useCallback(async (query: string) => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "8",
      search: query.trim(),
    });
    const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
      `/inventory/locations?${params}`,
    );
    return data.data;
  }, []);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "8",
      search: query.trim(),
    });
    const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !locationId || lines.some((l) => !l.itemId)) {
      setError("Vui lòng chọn nhà cung cấp, vị trí nhập kho và mặt hàng hợp lệ.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/inventory/purchase-orders", {
        providerId,
        locationId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          orderedQuantity: Number(l.orderedQuantity),
          unitPrice: Number(l.unitPrice),
          notes: l.notes || undefined,
        })),
      });
      await onCreated();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Tạo phiếu đặt hàng"
      onCancel={onCancel}
      onSave={() => formRef.current?.requestSubmit()}
      saveLabel={saving ? "Đang lưu…" : "Tạo phiếu"}
      saveDisabled={saving}
      className="max-w-[680px]"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <SearchListingInput
                label="Nhà cung cấp"
                placeholder="Tìm theo mã hoặc tên nhà cung cấp"
                value={providerQuery}
                onValueChange={(val) => {
                  setProviderQuery(val);
                  setProviderId("");
                }}
                onSelect={(provider) => {
                  setProviderId(provider.id);
                  setProviderQuery(`${provider.code} · ${provider.name}`);
                }}
                search={searchProviders}
                itemKey={(provider) => provider.id}
                renderItem={(provider) => provider.name}
                renderMeta={(provider) => provider.code}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <SearchListingInput
                label="Vị trí nhập kho"
                placeholder="Tìm theo mã hoặc tên vị trí"
                value={locationQuery}
                onValueChange={(val) => {
                  setLocationQuery(val);
                  setLocationId("");
                }}
                onSelect={(location) => {
                  setLocationId(location.id);
                  setLocationQuery(`${location.code} · ${location.name}`);
                }}
                search={searchLocations}
                itemKey={(location) => location.id}
                renderItem={(location) => location.name}
                renderMeta={(location) => `${location.code} · ${location.storageId}`}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Ngày giao dự kiến</label>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Ghi chú</label>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Dòng hàng</span>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                + Thêm dòng
              </Button>
            </div>
            <div className="rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left">Mặt hàng</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-left">Ghi chú</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <SearchListingInput
                          placeholder="Tìm mã hoặc tên hàng"
                          value={line.itemLabel}
                          onValueChange={(val) => {
                            updateLine(idx, "itemLabel", val);
                            updateLine(idx, "itemId", "");
                          }}
                          onSelect={(item) => {
                            updateLine(idx, "itemId", item.id);
                            updateLine(idx, "itemLabel", `${item.code} · ${item.name}`);
                          }}
                          search={searchItems}
                          itemKey={(item) => item.id}
                          renderItem={(item) => item.name}
                          renderMeta={(item) => `${item.code} · ${item.unit}`}
                          required
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          className="text-right"
                          value={line.orderedQuantity}
                          onChange={(e) => updateLine(idx, "orderedQuantity", e.target.value)}
                          required
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <MoneyInput
                          className="text-right"
                          value={line.unitPrice === 0 ? "" : line.unitPrice}
                          onChange={(v) =>
                            updateLine(idx, "unitPrice", v === "" ? 0 : v)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Input
                          value={line.notes}
                          onChange={(e) => updateLine(idx, "notes", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2 text-center align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length === 1}
                        >
                          ×
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </form>
    </AppModal>
  );
}

// ─── Purchase Order Detail Modal ───────────────────────────────────────────────

function PurchaseOrderDetailModal({
  order,
  actionLoading,
  onApprove,
  onReceive,
  onCancel,
  onClose,
}: {
  order: PurchaseOrder;
  actionLoading: string | null;
  onApprove: () => void;
  onReceive: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Phiếu đặt hàng ${order.documentNumber ?? "(chưa duyệt)"}`}
      showFooter={false}
      className="max-w-[680px]"
    >
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status]}`}
        >
          {STATUS_LABEL[order.status]}
        </span>
      </div>

        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">ID nhà cung cấp</dt>
            <dd className="font-mono text-xs">{order.providerId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">ID vị trí kho</dt>
            <dd className="font-mono text-xs">{order.locationId}</dd>
          </div>
          {order.expectedDate && (
            <div>
              <dt className="text-muted-foreground">Ngày giao dự kiến</dt>
              <dd>{new Date(order.expectedDate).toLocaleDateString("vi-VN")}</dd>
            </div>
          )}
          {order.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Ghi chú</dt>
              <dd>{order.notes}</dd>
            </div>
          )}
        </dl>

        <h3 className="mb-2 text-sm font-semibold">Dòng hàng</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1 text-left">ID mặt hàng</th>
              <th className="py-1 text-right">Đặt</th>
              <th className="py-1 text-right">Đã nhận</th>
              <th className="py-1 text-right">Đơn giá</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="py-1 font-mono text-xs">{line.itemId}</td>
                <td className="py-1 text-right">{line.orderedQuantity}</td>
                <td className="py-1 text-right">{line.receivedQuantity}</td>
                <td className="py-1 text-right">
                  {formatMoneyInteger(line.unitPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end gap-2">
          {order.status === "DRAFT" && (
            <Button
              variant="default"
              size="sm"
              disabled={actionLoading === order.id}
              onClick={onApprove}
            >
              Duyệt phiếu
            </Button>
          )}
          {(order.status === "APPROVED" || order.status === "RECEIVING") && (
            <Button variant="default" size="sm" onClick={onReceive}>
              Nhận hàng
            </Button>
          )}
          {(order.status === "DRAFT" || order.status === "APPROVED") && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={onCancel}>
              Huỷ phiếu
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
    </AppModal>
  );
}

// ─── Receive Goods Modal ───────────────────────────────────────────────────────

function ReceiveGoodsModal({
  order,
  onCancel,
  onReceived,
}: {
  order: PurchaseOrder;
  onCancel: () => void;
  onReceived: () => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const line of order.lines) {
      init[line.id] = Number(line.orderedQuantity) - Number(line.receivedQuantity);
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const pendingLines = order.lines.filter(
    (l) => Number(l.receivedQuantity) < Number(l.orderedQuantity),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const lines = pendingLines
        .filter((l) => quantities[l.id] > 0)
        .map((l) => ({ lineId: l.id, receivedQuantity: Number(quantities[l.id]) }));

      if (lines.length === 0) {
        setError("Vui lòng nhập số lượng nhận cho ít nhất một dòng hàng");
        return;
      }

      await apiClient.post(`/inventory/purchase-orders/${order.id}/receive`, { lines });
      await onReceived();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Nhận hàng vào kho"
      description={`Phiếu: ${order.documentNumber ?? order.id}`}
      onCancel={onCancel}
      onSave={() => formRef.current?.requestSubmit()}
      saveLabel={saving ? "Đang nhập kho…" : "Xác nhận nhận hàng"}
      saveDisabled={saving}
      className="max-w-[560px]"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        onSubmit={(e) => void handleSubmit(e)}
      >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-1 text-left">Mặt hàng</th>
                <th className="py-1 text-right">Còn lại</th>
                <th className="py-1 text-right">Số lượng nhận</th>
              </tr>
            </thead>
            <tbody>
              {pendingLines.map((line) => {
                const remaining = Number(line.orderedQuantity) - Number(line.receivedQuantity);
                return (
                  <tr key={line.id} className="border-b">
                    <td className="py-1.5 font-mono text-xs">{line.itemId}</td>
                    <td className="py-1.5 text-right">{remaining}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="any"
                        className="w-24 rounded border border-input bg-background px-2 py-1 text-right text-sm"
                        value={quantities[line.id] ?? 0}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [line.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        </form>
    </AppModal>
  );
}
