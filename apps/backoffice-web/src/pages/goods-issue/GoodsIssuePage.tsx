import { useCallback, useEffect, useRef, useState } from "react";
import { formatClientError } from "@erp/api-client";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { AppModal, Button, Input, type ToolbarItem } from "@erp/ui";
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

type GoodsIssueStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

interface GoodsIssueLine {
  id: string;
  itemId: string;
  quantity: number;
  notes?: string;
}

interface GoodsIssue {
  id: string;
  documentNumber?: string;
  locationId: string;
  reason: string;
  status: GoodsIssueStatus;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  lines: GoodsIssueLine[];
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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

const STATUS_LABEL: Record<GoodsIssueStatus, string> = {
  DRAFT: "Nháp",
  APPROVED: "Đã duyệt",
  POSTED: "Đã xuất kho",
  CANCELLED: "Đã huỷ",
};

const STATUS_COLOR: Record<GoodsIssueStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-blue-100 text-blue-700",
  POSTED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-600",
};

export function GoodsIssuePage() {
  const [records, setRecords] = useState<PaginatedResponse<GoodsIssue> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [selectedIssue, setSelectedIssue] = useState<GoodsIssue | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<GoodsIssue | null>(null);
  const [confirmPost, setConfirmPost] = useState<GoodsIssue | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await apiClient.get<PaginatedResponse<GoodsIssue>>(
        `/inventory/goods-issues?${params}`,
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

  const handleApprove = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/approve`);
      await loadRecords();
      if (selectedIssue?.id === issue.id) {
        const { data } = await apiClient.get<GoodsIssue>(`/inventory/goods-issues/${issue.id}`);
        setSelectedIssue(data);
      }
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePost = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/post`);
      setConfirmPost(null);
      await loadRecords();
      if (selectedIssue?.id === issue.id) setSelectedIssue(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/cancel`);
      setConfirmCancel(null);
      await loadRecords();
      if (selectedIssue?.id === issue.id) setSelectedIssue(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setActionLoading(null);
    }
  };

  const columns: TableColumn<GoodsIssue>[] = [
    {
      key: "documentNumber",
      label: "Số phiếu",
      render: (row) =>
        row.documentNumber ?? (
          <span className="italic text-muted-foreground">Chưa xuất kho</span>
        ),
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
      key: "reason",
      label: "Lý do xuất",
      render: (row) => row.reason,
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
          <h1 className="text-2xl font-semibold">Phiếu xuất hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quản lý phiếu xuất hàng khỏi kho. Hàng chỉ được xuất khi có phiếu xuất hàng đã được duyệt và đăng.
          </p>
        </div>
      </div>

      <TableActionHeader
        className="mb-4"
        breadcrumbs={resolveBackofficeBreadcrumbs("/inventory/goods-issues")}
        items={buildGoodsIssueToolbarItems({
          onCreate: () => setShowCreateForm(true),
        })}
      />

      <div className="mb-4 flex gap-3">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <BaseDataTable
        columns={columns}
        rows={records?.data ?? []}
        loading={loading}
        emptyLabel="Chưa có phiếu xuất hàng."
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <div className="flex gap-2">
            <Button
              variant="link"
              size="sm"
              className="h-auto px-1 py-0.5"
              onClick={() => setSelectedIssue(row)}
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
            {row.status === "APPROVED" && (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-1 py-0.5 text-green-600"
                onClick={() => setConfirmPost(row)}
              >
                Xuất kho
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
        <CreateGoodsIssueModal
          onCancel={() => setShowCreateForm(false)}
          onCreated={async () => {
            setShowCreateForm(false);
            await loadRecords();
          }}
        />
      )}

      {selectedIssue && (
        <GoodsIssueDetailModal
          issue={selectedIssue}
          actionLoading={actionLoading}
          onApprove={() => void handleApprove(selectedIssue)}
          onPost={() => setConfirmPost(selectedIssue)}
          onCancel={() => setConfirmCancel(selectedIssue)}
          onClose={() => setSelectedIssue(null)}
        />
      )}

      {confirmPost && (
        <ConfirmActionModal
          title="Xác nhận xuất kho"
          message={`Xuất hàng theo phiếu ${confirmPost.documentNumber ?? confirmPost.id}? Thao tác này sẽ trừ tồn kho ngay lập tức và không thể hoàn tác.`}
          confirmLabel="Xuất kho"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmPost.id}
          onCancel={() => setConfirmPost(null)}
          onConfirm={() => void handlePost(confirmPost)}
        />
      )}

      {confirmCancel && (
        <ConfirmActionModal
          title="Huỷ phiếu xuất hàng"
          message={`Xác nhận huỷ phiếu ${confirmCancel.documentNumber ?? confirmCancel.id}?`}
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

function buildGoodsIssueToolbarItems({
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

// ─── Create Goods Issue Modal ──────────────────────────────────────────────────

function CreateGoodsIssueModal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [locationId, setLocationId] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ itemId: "", itemLabel: "", quantity: 1, notes: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addLine = () =>
    setLines((prev) => [...prev, { itemId: "", itemLabel: "", quantity: 1, notes: "" }]);
  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: unknown) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

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
    if (!locationId || lines.some((l) => !l.itemId)) {
      setError("Vui lòng chọn vị trí kho và mặt hàng hợp lệ.");
      return;
    }
    setSaving(true);
    try {
      await apiClient.post("/inventory/goods-issues", {
        locationId,
        reason,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
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
      title="Tạo phiếu xuất hàng"
      onCancel={onCancel}
      onSave={() => formRef.current?.requestSubmit()}
      saveLabel={saving ? "Đang lưu…" : "Tạo phiếu"}
      saveDisabled={saving}
      className="max-w-[640px]"
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
                label="Vị trí kho xuất"
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
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Lý do xuất *</label>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Vd: Bán hàng, nội bộ, mẫu..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Ghi chú</label>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
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
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                          required
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

// ─── Goods Issue Detail Modal ──────────────────────────────────────────────────

function GoodsIssueDetailModal({
  issue,
  actionLoading,
  onApprove,
  onPost,
  onCancel,
  onClose,
}: {
  issue: GoodsIssue;
  actionLoading: string | null;
  onApprove: () => void;
  onPost: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Phiếu xuất hàng ${issue.documentNumber ?? "(chưa xuất kho)"}`}
      showFooter={false}
      className="max-w-[640px]"
    >
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[issue.status]}`}
        >
          {STATUS_LABEL[issue.status]}
        </span>
      </div>

        <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">ID vị trí kho</dt>
            <dd className="font-mono text-xs">{issue.locationId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lý do xuất</dt>
            <dd>{issue.reason}</dd>
          </div>
          {issue.notes && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Ghi chú</dt>
              <dd>{issue.notes}</dd>
            </div>
          )}
          {issue.postedAt && (
            <div>
              <dt className="text-muted-foreground">Thời gian xuất kho</dt>
              <dd>{new Date(issue.postedAt).toLocaleString("vi-VN")}</dd>
            </div>
          )}
        </dl>

        <h3 className="mb-2 text-sm font-semibold">Dòng hàng</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="py-1 text-left">ID mặt hàng</th>
              <th className="py-1 text-right">Số lượng</th>
              <th className="py-1 text-left">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="py-1 font-mono text-xs">{line.itemId}</td>
                <td className="py-1 text-right">{line.quantity}</td>
                <td className="py-1 text-muted-foreground">{line.notes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end gap-2">
          {issue.status === "DRAFT" && (
            <Button
              variant="default"
              size="sm"
              disabled={actionLoading === issue.id}
              onClick={onApprove}
            >
              Duyệt phiếu
            </Button>
          )}
          {issue.status === "APPROVED" && (
            <Button variant="default" size="sm" onClick={onPost}>
              Xuất kho
            </Button>
          )}
          {(issue.status === "DRAFT" || issue.status === "APPROVED") && (
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
