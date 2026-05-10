import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppModal,
  Button,
  DocumentFormDialog,
  DocumentListShell,
  formatMoneyInteger,
  Input,
  LineItemGrid,
  MoneyInput,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type LineColumn,
  type PeriodValue,
  type ToolbarItem,
  UnsavedChangesDialog,
  type UnsavedChangesChoice,
} from "@erp/ui";
import {
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Copy,
  Eye,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { SearchListingInput } from "../../components/forms/SearchListingInput";
import { InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import { MOCK_GOODS_ISSUES } from "./GoodsIssuePage.fixtures";

type GoodsIssueStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

interface GoodsIssueLine {
  id: string;
  itemId: string;
  quantity: number;
  unitPrice?: number;
  notes?: string;
  itemCode?: string;
  itemName?: string;
  warehouse?: string;
  position?: string;
  unit?: string;
}

interface GoodsIssue {
  id: string;
  documentNumber?: string;
  customerId?: string;
  customerName?: string;
  locationId: string;
  reason?: string;
  status: GoodsIssueStatus;
  issueDate?: string;
  notes?: string;
  documentType?: string;
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

const FILTER_KEYS = [
  "date",
  "documentNumber",
  "subject",
  "totalAmount",
  "notes",
  "reason",
  "documentType",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

function lineSubtotal(l: { quantity: number; unitPrice?: number }): number {
  return Number(l.quantity) * Number(l.unitPrice ?? 0);
}

function issueTotal(o: GoodsIssue): number {
  return o.lines.reduce((s, l) => s + lineSubtotal(l), 0);
}

export function GoodsIssuePage() {
  const [records, setRecords] = useState<PaginatedResponse<GoodsIssue> | null>(null);
  const [customers, setCustomers] = useState<InventoryProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editingIssue, setEditingIssue] = useState<GoodsIssue | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GoodsIssue | null>(null);
  const [confirmPost, setConfirmPost] = useState<GoodsIssue | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const { data } = await apiClient.get<PaginatedResponse<GoodsIssue>>(
        `/inventory/goods-issues?${params}`,
      );
      // Replace with real data from API calls
      if (data.data.length === 0) {
        setRecords({
          data: MOCK_GOODS_ISSUES as unknown as GoodsIssue[],
          total: MOCK_GOODS_ISSUES.length,
          page: 1,
          pageSize: pagination.pageSize,
        });
      } else {
        setRecords(data);
      }
    } catch {
      // Replace with real data from API calls
      setRecords({
        data: MOCK_GOODS_ISSUES as unknown as GoodsIssue[],
        total: MOCK_GOODS_ISSUES.length,
        page: 1,
        pageSize: pagination.pageSize,
      });
    } finally {
      setLoading(false);
    }
  }, [pagination]);

  const loadCustomers = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
        "/inventory/providers?page=1&pageSize=200",
      );
      setCustomers(data.data);
    } catch {
      // best-effort; row will fall back to id if name is missing
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, c.name);
    for (const issue of records?.data ?? []) {
      if (issue.customerName && issue.customerId)
        map.set(issue.customerId, issue.customerName);
    }
    return map;
  }, [customers, records]);

  const selectedIssue = useMemo(
    () => records?.data.find((o) => o.id === selectedId) ?? null,
    [records, selectedId],
  );

  // ─── Row actions ──────────────────────────────────────────────────────────────

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  const handleApprove = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/approve`);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePost = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/post`);
      setConfirmPost(null);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/cancel`);
      setConfirmDelete(null);
      if (selectedId === issue.id) setSelectedId(null);
      await reloadAfterMutation();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Toolbar config ───────────────────────────────────────────────────────────

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setEditingIssue(null);
        setDialogMode("create");
      },
    },
    {
      id: "duplicate",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selectedIssue,
      onClick: () => {
        if (!selectedIssue) return;
        setEditingIssue(selectedIssue);
        setDialogMode("create");
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selectedIssue,
      onClick: () => {
        if (!selectedIssue) return;
        setEditingIssue(selectedIssue);
        setDialogMode("view");
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selectedIssue || selectedIssue.status !== "DRAFT",
      onClick: () => {
        if (!selectedIssue) return;
        setEditingIssue(selectedIssue);
        setDialogMode("edit");
      },
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled:
        !selectedIssue ||
        (selectedIssue.status !== "DRAFT" && selectedIssue.status !== "APPROVED"),
      onClick: () => selectedIssue && setConfirmDelete(selectedIssue),
    },
    { id: "sep1", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
    {
      id: "split",
      label: "Chia hàng",
      icon: Copy,
      disabled: !selectedIssue,
      onClick: () => toast.info("Tính năng chia hàng sẽ được bổ sung."),
    },
    {
      id: "barcode",
      label: "In tem mã",
      icon: Tags,
      disabled: !selectedIssue,
      onClick: () => toast.info("Tính năng in tem mã sẽ được bổ sung."),
    },
  ];

  // ─── Master table columns ─────────────────────────────────────────────────────

  const columns: TableColumn<GoodsIssue>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 110,
      render: (row) =>
        row.issueDate
          ? new Date(row.issueDate).toLocaleDateString("vi-VN")
          : new Date(row.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu xuất",
      width: 140,
      render: (row) =>
        row.documentNumber ? (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(row.id);
              setEditingIssue(row);
              setDialogMode("view");
            }}
          >
            {row.documentNumber}
          </button>
        ) : (
          <span className="text-muted-foreground italic">Chưa xuất kho</span>
        ),
    },
    {
      key: "subject",
      label: "Đối tượng",
      width: 180,
      render: (row) =>
        row.customerName ??
        (row.customerId ? customerNameById.get(row.customerId) ?? row.customerId : ""),
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 140,
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(issueTotal(row)),
    },
    {
      key: "notes",
      label: "Diễn giải",
      render: (row) => row.notes ?? "",
    },
    {
      key: "reason",
      label: "Lý do",
      width: 160,
      render: (row) => row.reason ?? "",
    },
    {
      key: "documentType",
      label: "Loại chứng từ",
      width: 200,
      render: (row) => row.documentType ?? "Phiếu xuất kho bán hàng",
    },
  ];

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        })),
    }),
    [columnFilters],
  );

  const totalSum = useMemo(
    () => (records?.data ?? []).reduce((s, r) => s + issueTotal(r), 0),
    [records],
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <DocumentListShell
        title="Xuất kho"
        tabs={<InventoryTabBar activeId="goods-issues" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        filters={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={() => void loadRecords()}
          />
        }
        summary={
          <div className="flex items-center justify-end gap-6 px-2">
            <span className="text-muted-foreground">Tổng tiền:</span>
            <span className="text-base font-semibold">{formatMoneyInteger(totalSum)}</span>
          </div>
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
          />
        }
        detailPanel={<DetailPanel issue={selectedIssue} />}
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu xuất kho."
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label="Chọn dòng"
                checked={selectedId === row.id}
                onChange={() => setSelectedId(selectedId === row.id ? null : row.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      {dialogMode && (
        <GoodsIssueFormDialog
          mode={dialogMode}
          initial={editingIssue}
          customers={customers}
          actionLoading={!!actionLoading}
          onClose={() => {
            setDialogMode(null);
            setEditingIssue(null);
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditingIssue(null);
            await loadRecords();
          }}
          onApprove={editingIssue ? () => void handleApprove(editingIssue) : undefined}
          onPost={editingIssue ? () => setConfirmPost(editingIssue) : undefined}
          onRequestDelete={editingIssue ? () => setConfirmDelete(editingIssue) : undefined}
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa phiếu xuất kho"
          message={`Xác nhận xóa phiếu ${confirmDelete.documentNumber ?? confirmDelete.id}? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete(confirmDelete)}
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
    </>
  );
}

// ─── Detail panel (selected issue's lines) ───────────────────────────────────

function DetailPanel({ issue }: { issue: GoodsIssue | null }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {!issue ? (
        <p className="text-sm text-muted-foreground">Chọn một phiếu để xem chi tiết.</p>
      ) : issue.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Phiếu này chưa có dòng hàng.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">Mã SKU</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Tên hàng hóa</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Kho</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Vị trí</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Đơn vị tính</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Số lượng</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Đơn giá</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Thành tiền</th>
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="border-r px-2 py-1 font-mono text-xs">
                  {line.itemCode ?? line.itemId.slice(0, 8)}
                </td>
                <td className="border-r px-2 py-1">{line.itemName ?? "—"}</td>
                <td className="border-r px-2 py-1">
                  {line.warehouse ?? issue.locationId.slice(0, 8)}
                </td>
                <td className="border-r px-2 py-1">{line.position ?? "—"}</td>
                <td className="border-r px-2 py-1">{line.unit ?? "Đôi"}</td>
                <td className="border-r px-2 py-1 text-right tabular-nums">{line.quantity}</td>
                <td className="border-r px-2 py-1 text-right tabular-nums">
                  {formatMoneyInteger(line.unitPrice ?? 0)}
                </td>
                <td className="border-r px-2 py-1 text-right tabular-nums">
                  {formatMoneyInteger(lineSubtotal(line))}
                </td>
                <td className="px-2 py-1">{line.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Form dialog (create / edit / view) ──────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  unit: "",
  quantity: 1,
  unitPrice: 0,
  notes: "",
});

function GoodsIssueFormDialog({
  mode,
  initial,
  customers,
  actionLoading,
  onClose,
  onSaved,
  onApprove,
  onPost,
  onRequestDelete,
}: {
  mode: "create" | "edit" | "view";
  initial: GoodsIssue | null;
  customers: InventoryProvider[];
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onApprove?: () => void;
  onPost?: () => void;
  onRequestDelete?: () => void;
}) {
  const isView = mode === "view";

  const initialCustomerLabel = useMemo(() => {
    if (!initial) return "";
    if (initial.customerName) return initial.customerName;
    const c = customers.find((x) => x.id === initial.customerId);
    return c ? `${c.code} · ${c.name}` : initial.customerId ?? "";
  }, [initial, customers]);

  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [customerQuery, setCustomerQuery] = useState(initialCustomerLabel);
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");
  const [locationQuery, setLocationQuery] = useState("");
  const [purpose, setPurpose] = useState<"OTHER" | "SALE">("OTHER");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [receiver, setReceiver] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    initial?.issueDate ?? new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() =>
    initial
      ? initial.lines.map((l) => ({
          itemId: l.itemId,
          itemLabel: l.itemCode ?? l.itemId.slice(0, 8),
          unit: l.unit ?? "",
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice ?? 0),
          notes: l.notes ?? "",
        }))
      : [emptyLine()],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const searchCustomers = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8", search: query.trim() });
    const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
      `/inventory/providers?${params}`,
    );
    return data.data;
  }, []);

  const searchLocations = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8", search: query.trim() });
    const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
      `/inventory/locations?${params}`,
    );
    return data.data;
  }, []);

  const searchItems = useCallback(async (query: string) => {
    const params = new URLSearchParams({ page: "1", pageSize: "8", search: query.trim() });
    const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
      `/inventory/items?${params}`,
    );
    return data.data;
  }, []);

  const totalQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const totalAmount = lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSave = useCallback(async () => {
    if (!locationId || lines.some((l) => !l.itemId)) {
      setError("Vui lòng chọn kho xuất và mặt hàng hợp lệ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/inventory/goods-issues", {
        locationId,
        reason: reason || (purpose === "SALE" ? "Bán hàng" : "Khác"),
        notes: notes || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          notes: l.notes || undefined,
        })),
      });
      setDirty(false);
      await onSaved();
    } catch (err) {
      setError(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [locationId, lines, reason, notes, purpose, onSaved]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      await handleSave();
      onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
    {
      id: "new",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setCustomerId("");
        setCustomerQuery("");
        setLocationId("");
        setLocationQuery("");
        setReason("");
        setReceiver("");
        setNotes("");
        setLines([emptyLine()]);
        setDirty(false);
        setError(null);
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !isView,
      onClick: () => toast.info("Chuyển sang chế độ chỉnh sửa từ thanh công cụ chính."),
    },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isView || saving,
      onClick: () => void handleSave(),
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !onRequestDelete,
      onClick: () => onRequestDelete?.(),
    },
    {
      id: "void",
      label: "Hoãn",
      icon: RotateCcw,
      disabled: !onApprove || initial?.status !== "DRAFT",
      onClick: () => onApprove?.(),
    },
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 160,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <SearchListingInput
          placeholder="Tìm mã hoặc tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) => (i === idx ? { ...l, itemLabel: val, itemId: "" } : l)),
            );
            markDirty();
          }}
          onSelect={(item) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, itemId: item.id, itemLabel: item.code, unit: item.unit }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 220,
      type: "readonly",
      getValue: (row) => row.itemLabel,
    },
    { key: "warehouse", label: "Kho", width: 140, type: "readonly", getValue: () => "" },
    { key: "position", label: "Vị trí", width: 100, type: "readonly", getValue: () => "" },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 90,
      type: "readonly",
      getValue: (r) => r.unit || "Đôi",
    },
    {
      key: "quantity",
      label: "Số lượng",
      width: 100,
      type: "number",
      align: "right",
      filterSymbol: "≤",
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 120,
      align: "right",
      filterSymbol: "≤",
      renderEditor: (row, idx) => (
        <MoneyInput
          className="h-full w-full rounded-none border-0 bg-transparent px-1 text-right shadow-none"
          value={row.unitPrice === 0 ? "" : row.unitPrice}
          onChange={(v) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, unitPrice: v === "" ? 0 : Number(v) } : l,
              ),
            );
            markDirty();
          }}
        />
      ),
    },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={
          mode === "create"
            ? "Thêm mới phiếu xuất kho"
            : `Phiếu xuất kho ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        purpose={
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">Mục đích xuất kho</span>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={purpose === "OTHER"}
                onChange={() => {
                  setPurpose("OTHER");
                  markDirty();
                }}
                disabled={isView}
              />
              Khác
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={purpose === "SALE"}
                onChange={() => {
                  setPurpose("SALE");
                  markDirty();
                }}
                disabled={isView}
              />
              Bán hàng
            </label>
          </div>
        }
        generalInfo={
          <>
            <FieldRow label="Đối tượng">
              <SearchListingInput
                placeholder="Tìm đối tượng"
                value={customerQuery}
                onValueChange={(v) => {
                  setCustomerQuery(v);
                  setCustomerId("");
                  markDirty();
                }}
                onSelect={(c) => {
                  setCustomerId(c.id);
                  setCustomerQuery(`${c.code} · ${c.name}`);
                  markDirty();
                }}
                search={searchCustomers}
                itemKey={(c) => c.id}
                renderItem={(c) => c.name}
                renderMeta={(c) => c.code}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Người nhận">
              <Input
                value={receiver}
                onChange={(e) => {
                  setReceiver(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Lý do">
              <Input
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Diễn giải">
              <Input
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Tham chiếu">
              <span className="text-sm text-muted-foreground">—</span>
            </FieldRow>
            <FieldRow label="Tài liệu đính kèm">
              <Button type="button" variant="outline" size="sm" disabled>
                Tải tệp …
              </Button>
            </FieldRow>
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu xuất">
              <Input value={initial?.documentNumber ?? ""} readOnly />
            </FieldRow>
            <FieldRow label="Ngày xuất">
              <Input
                type="date"
                value={docDate}
                onChange={(e) => {
                  setDocDate(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Giờ xuất">
              <Input
                type="time"
                value={docTime}
                onChange={(e) => {
                  setDocTime(e.target.value);
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Kho">
              <SearchListingInput
                placeholder="Chọn kho"
                value={locationQuery}
                onValueChange={(v) => {
                  setLocationQuery(v);
                  setLocationId("");
                  markDirty();
                }}
                onSelect={(loc) => {
                  setLocationId(loc.id);
                  setLocationQuery(`${loc.code} · ${loc.name}`);
                  markDirty();
                }}
                search={searchLocations}
                itemKey={(loc) => loc.id}
                renderItem={(loc) => loc.name}
                renderMeta={(loc) => loc.code}
                disabled={isView}
              />
            </FieldRow>
          </>
        }
        detailActions={
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" disabled />
              <span>Quét mã vạch</span>
            </label>
            <button
              type="button"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              Chọn kho
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              Nhập khẩu
            </button>
            {onPost && initial?.status === "APPROVED" && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-green-600 hover:underline"
                onClick={onPost}
              >
                Xuất kho
              </button>
            )}
          </>
        }
        detail={
          <LineItemGrid
            columns={lineColumns}
            rows={lines}
            onChangeCell={(idx, key, value) => {
              setLines((prev) =>
                prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
              );
              markDirty();
            }}
            onAddRow={() => {
              setLines((prev) => [...prev, emptyLine()]);
              markDirty();
            }}
            onDeleteRow={(idx) => {
              setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
              markDirty();
            }}
            showAddRow={!isView}
            showRowActions={!isView}
          />
        }
        footerSummary={
          <div className="flex items-center justify-between">
            <span>Số dòng = {lines.length}</span>
            <div className="flex gap-8">
              <span>
                Số lượng: <strong className="ml-1">{totalQty}</strong>
              </span>
              <span>
                Thành tiền:{" "}
                <strong className="ml-1">{formatMoneyInteger(totalAmount)}</strong>
              </span>
            </div>
          </div>
        }
      />

      {error && (
        <AppModal
          open
          onOpenChange={() => setError(null)}
          title="Lỗi"
          defaultWidth={420}
          defaultHeight={220}
        >
          <p className="text-sm text-destructive">{error}</p>
        </AppModal>
      )}

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
