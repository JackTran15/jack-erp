import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { LookupField } from "../../components/forms/LookupField";
import {
  QuickCreateItemDialog,
  QuickCreateIssueReasonDialog,
  QuickCreateLocationDialog,
  QuickCreateProviderDialog,
  type IssueReasonPurpose as ReasonBucket,
  type QuickIssueReason,
  type QuickItem,
  type QuickLocation,
  type QuickProvider,
} from "../../components/forms/QuickCreateDialogs";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import { ChooseWarehouseDialog } from "../../components/document/ChooseWarehouseDialog";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../inventory-line-normalization";

type GoodsIssueStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

export type GoodsIssuePurposeUI =
  | "OTHER"
  | "SALE"
  | "TRANSFER_OUT"
  | "DISPOSAL"
  | "STOCK_TAKE";

interface GoodsIssueLine {
  id: string;
  itemId: string;
  quantity: number | string;
  unitPrice?: number | string;
  lineTotal?: number | string;
  notes?: string;
  itemCode?: string;
  itemName?: string;
  warehouse?: string;
  position?: string;
  unit?: string;
  locationId?: string;
  location?: { id: string; code: string; name: string; storageId?: string } | null;
  item?: { id: string; code: string; name: string; unit?: string; purchasePrice?: number | string | null } | null;
}

interface GoodsIssue {
  id: string;
  documentNumber?: string;
  customerId?: string;
  customerName?: string;
  providerId?: string | null;
  provider?: { id: string; code: string; name: string } | null;
  locationId: string;
  location?: { id: string; code: string; name: string; storageId?: string } | null;
  purpose?: GoodsIssuePurposeUI;
  reason?: string;
  reasonId?: string;
  reasonRef?: { id: string; code: string; name: string } | null;
  targetBranchId?: string;
  targetBranch?: { id: string; name: string } | null;
  referenceId?: string | null;
  referenceType?: string | null;
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
  /** Default purchase price (from item master) — used to auto-fill Đơn giá. */
  purchasePrice?: number | string | null;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

/** Active branch id used as X-Branch-Id (set by api-axios from localStorage). */
function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
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

function lineSubtotal(l: {
  quantity: number | string;
  unitPrice?: number | string;
  lineTotal?: number | string;
}): number {
  if (l.lineTotal !== undefined && l.lineTotal !== null && l.lineTotal !== "")
    return Number(l.lineTotal);
  return Number(l.quantity) * Number(l.unitPrice ?? 0);
}

const PURPOSE_LABELS: Record<GoodsIssuePurposeUI, string> = {
  OTHER: "Xuất khác",
  SALE: "Phiếu xuất kho bán hàng",
  TRANSFER_OUT: "Điều chuyển đến cửa hàng khác",
  DISPOSAL: "Hủy hàng",
  STOCK_TAKE: "Phiếu xuất kho kiểm kê",
};

const MANUAL_PURPOSES: GoodsIssuePurposeUI[] = [
  "OTHER",
  "TRANSFER_OUT",
  "DISPOSAL",
];

const STATUS_LABELS: Record<GoodsIssueStatus, string> = {
  DRAFT: "Chưa thực hiện",
  APPROVED: "Chưa thực hiện",
  POSTED: "Đã thực hiện",
  CANCELLED: "Đã hoãn",
};

interface BranchOption {
  id: string;
  name: string;
  address?: string | null;
}

interface IssueReasonOption {
  id: string;
  code: string;
  name: string;
  purpose: "OTHER" | "DISPOSAL";
}

function issueTotal(o: GoodsIssue): number {
  return o.lines.reduce((s, l) => s + lineSubtotal(l), 0);
}

export function GoodsIssuePage() {
  const [records, setRecords] = useState<PaginatedResponse<GoodsIssue> | null>(null);
  const [customers, setCustomers] = useState<InventoryProvider[]>([]);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
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
  const [confirmVoid, setConfirmVoid] = useState<GoodsIssue | null>(null);

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
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
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

  const loadStorages = useCallback(async () => {
    try {
      const branchId = getActiveBranchId();
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (branchId) params.set("branchId", branchId);
      const { data } = await apiClient.get<PaginatedResponse<InventoryStorage>>(
        `/inventory/storages?${params}`,
      );
      setStorages(data.data);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) map.set(c.id, c.name);
    for (const issue of records?.data ?? []) {
      if (issue.customerName && issue.customerId)
        map.set(issue.customerId, issue.customerName);
    }
    return map;
  }, [customers, records]);

  const storageNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of storages) map.set(s.id, s.name);
    return map;
  }, [storages]);

  const selectedIssue = useMemo(
    () => records?.data.find((o) => o.id === selectedId) ?? null,
    [records, selectedId],
  );

  // ─── Row actions ──────────────────────────────────────────────────────────────

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  const handleVoid = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    try {
      // Hoãn = đảo bút phiếu đã thực hiện. Cùng endpoint cancel() như "Xóa",
      // nhưng với phiếu POSTED, BE sẽ đảo bút tồn kho trước khi đánh dấu huỷ.
      await apiClient.post(`/inventory/goods-issues/${issue.id}/cancel`);
      setConfirmVoid(null);
      if (selectedId === issue.id) setSelectedId(null);
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
      // Allow deleting any non-cancelled row. BE cancel() handles POSTED by
      // reversing the stock movements before marking the doc cancelled.
      disabled: !selectedIssue || selectedIssue.status === "CANCELLED",
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
      render: (row) => (
        <button
          type="button"
          className="text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(row.id);
            setEditingIssue(row);
            setDialogMode("view");
          }}
          title={row.documentNumber ?? row.id}
        >
          {/* Pre-BE-change rows may still have null docNumber — show short id
              so the cell stays clickable. New rows always carry the number. */}
          {row.documentNumber ?? `#${row.id.slice(0, 8)}`}
        </button>
      ),
    },
    {
      key: "subject",
      label: "Đối tượng",
      width: 180,
      render: (row) => {
        // Prefer the explicit provider pick stored on the row. Fall back to
        // targetBranch for TRANSFER_OUT phiếu created before provider was
        // added, and finally to the page-level provider name cache.
        if (row.provider?.name) return row.provider.name;
        if (row.providerId)
          return customerNameById.get(row.providerId) ?? row.providerId;
        if (row.purpose === "TRANSFER_OUT") return row.targetBranch?.name ?? "—";
        return row.customerName ?? "—";
      },
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
      render: (row) => PURPOSE_LABELS[row.purpose ?? "OTHER"],
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 130,
      render: (row) => (
        <span
          className={
            row.status === "POSTED"
              ? "text-green-600"
              : row.status === "CANCELLED"
                ? "text-muted-foreground"
                : "text-foreground"
          }
        >
          {STATUS_LABELS[row.status]}
        </span>
      ),
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

  const nextDocumentNumber = useMemo(() => {
    const rows = records?.data ?? [];
    let max = 0;
    for (const row of rows) {
      const m = row.documentNumber?.match(/(\d+)$/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return `GI${String(max + 1).padStart(6, "0")}`;
  }, [records]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Xuất kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="goods-issues" />}
        toolbar={
          <PageToolbar
            items={toolbarItems}
            tone="primary"
            className="m-2 rounded-md"
          />
        }
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
        detailPanel={
          <DetailPanel issue={selectedIssue} storageNameById={storageNameById} />
        }
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
          storages={storages}
          previewDocumentNumber={nextDocumentNumber}
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
          onVoid={editingIssue ? () => setConfirmVoid(editingIssue) : undefined}
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

      {confirmVoid && (
        <ConfirmActionModal
          title="Hoãn phiếu xuất kho"
          message={`Hoãn phiếu ${confirmVoid.documentNumber ?? confirmVoid.id}? Thao tác này sẽ đảo bút tồn kho đã xuất.`}
          confirmLabel="Hoãn phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmVoid.id}
          onCancel={() => setConfirmVoid(null)}
          onConfirm={() => void handleVoid(confirmVoid)}
        />
      )}
    </>
  );
}

// ─── Detail panel (selected issue's lines) ───────────────────────────────────

function DetailPanel({
  issue,
  storageNameById,
}: {
  issue: GoodsIssue | null;
  storageNameById: Map<string, string>;
}) {
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
            {issue.lines.map((line) => {
              const itemCode = line.item?.code ?? line.itemCode ?? line.itemId.slice(0, 8);
              const itemName = line.item?.name ?? line.itemName ?? "—";
              const unitLabel = line.item?.unit ?? line.unit ?? "—";
              const storageId = issue.location?.storageId;
              const storageName = storageId
                ? storageNameById.get(storageId) ?? storageId.slice(0, 8)
                : "—";
              const binCode = issue.location?.code ?? "—";
              return (
                <tr key={line.id} className="border-b">
                  <td className="border-r px-2 py-1 font-mono text-xs">{itemCode}</td>
                  <td className="border-r px-2 py-1">{itemName}</td>
                  <td className="border-r px-2 py-1">{storageName}</td>
                  <td className="border-r px-2 py-1 font-mono text-xs">{binCode}</td>
                  <td className="border-r px-2 py-1">{unitLabel}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">{Number(line.quantity)}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(Number(line.unitPrice ?? 0))}
                  </td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(lineSubtotal(line))}
                  </td>
                  <td className="px-2 py-1">{line.notes ?? ""}</td>
                </tr>
              );
            })}
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
  storageId: string;
  storageLabel: string;
  locationId: string;
  locationLabel: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  unit: "",
  storageId: "",
  storageLabel: "",
  locationId: "",
  locationLabel: "",
  quantity: 1,
  unitPrice: 0,
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const normalizeFormLines = (nextLines: FormLine[]) =>
  ensureTrailingBlankLine(nextLines, emptyLine);

function GoodsIssueFormDialog({
  mode,
  initial,
  customers,
  storages,
  previewDocumentNumber,
  actionLoading,
  onClose,
  onSaved,
  onVoid,
  onRequestDelete,
}: {
  mode: "create" | "edit" | "view";
  initial: GoodsIssue | null;
  customers: InventoryProvider[];
  storages: InventoryStorage[];
  previewDocumentNumber?: string;
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onVoid?: () => void;
  onRequestDelete?: () => void;
}) {
  const isView = mode === "view";

  // Resolve the eager-loaded provider first, then fall back to a customer lookup
  // for legacy rows that pre-date the provider column.
  const initialCustomer = useMemo(() => {
    if (!initial) return { id: "", code: "", name: "" };
    if (initial.provider) {
      return {
        id: initial.provider.id,
        code: initial.provider.code,
        name: initial.provider.name,
      };
    }
    if (initial.providerId) {
      const c = customers.find((x) => x.id === initial.providerId);
      return c
        ? { id: c.id, code: c.code, name: c.name }
        : { id: initial.providerId, code: "", name: "" };
    }
    if (initial.customerName) {
      const c = customers.find((x) => x.id === initial.customerId);
      return {
        id: initial.customerId ?? "",
        code: c?.code ?? "",
        name: initial.customerName,
      };
    }
    const c = customers.find((x) => x.id === initial.customerId);
    return c
      ? { id: c.id, code: c.code, name: c.name }
      : { id: "", code: "", name: "" };
  }, [initial, customers]);

  const [customerId, setCustomerId] = useState(initialCustomer.id);
  const [customerCode, setCustomerCode] = useState(initialCustomer.code);
  const [customerName, setCustomerName] = useState(initialCustomer.name);
  // Storage derived from the saved location's parent. Cached storages let us
  // resolve a name immediately on open; the picker will reset both if user
  // changes warehouse later. For a new (create) phiếu, default to the active
  // branch's main storage (list is main-first; fall back to the first kho).
  const defaultStorage = useMemo(
    () => storages.find((s) => s.isMainStorage) ?? storages[0],
    [storages],
  );
  const initialStorageId =
    initial?.location?.storageId ?? (initial ? "" : defaultStorage?.id ?? "");
  const initialStorageName = initialStorageId
    ? storages.find((s) => s.id === initialStorageId)?.name ?? ""
    : "";
  const [storageId, setStorageId] = useState(initialStorageId);
  const [storageQuery, setStorageQuery] = useState(initialStorageName);
  const [purpose, setPurpose] = useState<GoodsIssuePurposeUI>(
    initial?.purpose && MANUAL_PURPOSES.includes(initial.purpose)
      ? initial.purpose
      : "OTHER",
  );
  const [reasonId, setReasonId] = useState(initial?.reasonId ?? "");
  const [reasonLabel, setReasonLabel] = useState(
    initial?.reasonId ? initial?.reason ?? "" : "",
  );
  const [targetBranchId, setTargetBranchId] = useState(initial?.targetBranchId ?? "");
  const [targetBranchLabel, setTargetBranchLabel] = useState("");
  const [deliveryPerson, setDeliveryPerson] = useState("");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const notesAutoFilledRef = useRef(false);
  const [docDate, setDocDate] = useState(
    initial?.issueDate ?? new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [emptyLine()];

    const initialLines = initial.lines.map((l) => ({
          itemId: l.itemId,
          // Prefer the eager-loaded item code; fall back to the legacy
          // flat itemCode field or a short id slice as last resort.
          itemLabel: l.item?.code ?? l.itemCode ?? l.itemId.slice(0, 8),
          unit: l.item?.unit ?? l.unit ?? "",
          // Each line carries its own warehouse + bin (Misa parity).
          locationId: l.locationId ?? "",
          locationLabel: l.location?.code ?? "",
          storageId: l.location?.storageId ?? "",
          storageLabel:
            storages.find((s) => s.id === l.location?.storageId)?.name ?? "",
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice ?? 0),
          notes: l.notes ?? "",
        }));

    return isView ? initialLines : normalizeFormLines(initialLines);
  });

  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [chooseKhoOpen, setChooseKhoOpen] = useState(false);
  /** Line index that triggered the quick-create-location dialog, or null. */
  const [quickLocationLineIdx, setQuickLocationLineIdx] = useState<number | null>(null);
  const [quickItemLineIdx, setQuickItemLineIdx] = useState<number | null>(null);
  const [quickReasonBucket, setQuickReasonBucket] = useState<ReasonBucket | null>(
    null,
  );
  const [storageCache, setStorageCache] = useState<
    Array<{ id: string; name: string; branchId: string }>
  >([]);

  // "Tham chiếu": phiếu xuất kho kiểm kê được sinh tự động khi "Xử lý" một phiếu
  // kiểm kê. API chỉ trả referenceId — resolve số phiếu KK gốc để hiển thị.
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const referenceStockTakeId =
    initial?.referenceType === "STOCK_TAKE" ? initial.referenceId ?? null : null;
  useEffect(() => {
    if (!referenceStockTakeId) {
      setReferenceNumber(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ documentNumber?: string }>(
          `/inventory/stock-takes/${referenceStockTakeId}`,
        );
        if (!cancelled) setReferenceNumber(data.documentNumber ?? null);
      } catch {
        // best-effort — tham chiếu chỉ mang tính thông tin
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referenceStockTakeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const branchId = getActiveBranchId();
        const params = new URLSearchParams({ page: "1", pageSize: "200" });
        if (branchId) params.set("branchId", branchId);
        const { data } = await apiClient.get<
          PaginatedResponse<{ id: string; name: string; branchId: string }>
        >(`/inventory/storages?${params}`);
        if (!cancelled) setStorageCache(data.data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handlePurposeChange = (next: GoodsIssuePurposeUI) => {
    if (next === purpose) return;
    setPurpose(next);
    setReasonId("");
    setReasonLabel("");
    setTargetBranchId("");
    setTargetBranchLabel("");
    if (notesAutoFilledRef.current) {
      setNotes("");
      notesAutoFilledRef.current = false;
    }
    markDirty();
  };

  const searchCustomers = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryProvider>>(
        `/inventory/providers?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? storages.filter((s) => s.name.toLowerCase().includes(q))
        : storages;
      const effectivePageSize = pageSize ?? 8;
      const start = (page - 1) * effectivePageSize;
      const items = filtered.slice(start, start + effectivePageSize);
      return {
        items,
        hasMore: start + effectivePageSize < filtered.length,
        total: filtered.length,
      };
    },
    [storages],
  );

  const searchLocationsForStorage = useCallback(
    async (storageIdArg: string, query: string, page: number, pageSize?: number) => {
      if (!storageIdArg) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
        storageId: storageIdArg,
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
        `/inventory/locations?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 10;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        search: query.trim(),
      });
      const { data } = await apiClient.get<PaginatedResponse<InventoryItem>>(
        `/inventory/items?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return {
        items: data.data,
        hasMore: fetched < data.total,
        total: data.total,
      };
    },
    [],
  );

  const searchBranches = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 8;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<BranchOption>>(
        `/branches?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [],
  );

  const reasonBucket: ReasonBucket | null =
    purpose === "OTHER" ? "OTHER" : purpose === "DISPOSAL" ? "DISPOSAL" : null;

  const searchReasons = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      if (!reasonBucket) return { items: [], hasMore: false, total: 0 };
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
        purpose: reasonBucket,
        activeOnly: "true",
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<IssueReasonOption>>(
        `/inventory/issue-reasons?${params}`,
      );
      const fetched = data.page * data.pageSize;
      return { items: data.data, hasMore: fetched < data.total, total: data.total };
    },
    [reasonBucket],
  );

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const totalAmount = summaryLines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    // Toasts (not modal) — same reason as goods-receipt: AppModal validation
    // dialogs got stacked under the unsaved-changes confirm and disappeared.
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    if (persistableLines.some((l) => !l.storageId)) {
      toast.error("Mỗi dòng hàng phải chọn kho.");
      return false;
    }
    if (purpose === "TRANSFER_OUT" && !targetBranchId) {
      toast.error("Vui lòng chọn cửa hàng đích để điều chuyển.");
      return false;
    }
    setSaving(true);
    try {
      // Resolve a fallback bin per warehouse for lines the user left empty.
      const fallbackByStorage = new Map<string, string>();
      const resolvedLines: typeof persistableLines = [];
      for (const l of persistableLines) {
        let locationId = l.locationId;
        if (!locationId) {
          let fb = fallbackByStorage.get(l.storageId);
          if (fb === undefined) {
            const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
              `/inventory/locations?page=1&pageSize=1&storageId=${encodeURIComponent(l.storageId)}`,
            );
            const first = data.data[0];
            if (!first) {
              toast.error("Có kho chưa có vị trí nào. Vui lòng tạo ít nhất 1 vị trí trước.");
              setSaving(false);
              return false;
            }
            fb = first.id;
            fallbackByStorage.set(l.storageId, fb);
          }
          locationId = fb;
        }
        resolvedLines.push({ ...l, locationId });
      }
      const headerLocationId = resolvedLines[0]?.locationId ?? "";

      await apiClient.post("/inventory/goods-issues", {
        locationId: headerLocationId,
        providerId: customerId || undefined,
        purpose,
        reasonId:
          (purpose === "OTHER" || purpose === "DISPOSAL") && reasonId
            ? reasonId
            : undefined,
        targetBranchId: purpose === "TRANSFER_OUT" ? targetBranchId : undefined,
        notes: notes || undefined,
        lines: resolvedLines.map((l) => ({
          itemId: l.itemId,
          locationId: l.locationId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice) || 0,
          notes: l.notes || undefined,
        })),
      });
      setDirty(false);
      // "Lưu" tạo + thực hiện luôn (giống MISA): phiếu trả về đã ở trạng thái
      // đã xuất kho, đã ghi sổ tồn kho.
      toast.success("Đã xuất kho.");
      await onSaved();
      return true;
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [customerId, lines, notes, purpose, reasonId, targetBranchId, onSaved]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    // UnsavedChangesDialog closes itself via onOpenChange. We only decide
    // whether to close the parent form: yes on a successful save/discard,
    // no when save failed (validation toast already shown).
    if (choice === "save") {
      const ok = await handleSave();
      if (ok) onClose();
    } else if (choice === "discard") {
      onClose();
    }
  };

  const dialogToolbar: ToolbarItem[] = [
    { id: "prev", label: "Trước", icon: ChevronLeft, disabled: true, onClick: () => {} },
    { id: "next", label: "Sau", icon: ChevronRight, disabled: true, onClick: () => {} },
    { id: "sep1", type: "separator" },
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
      // Hoãn chỉ áp dụng cho phiếu đã thực hiện (POSTED) — đảo bút tồn kho.
      disabled: !onVoid || initial?.status !== "POSTED",
      onClick: () => onVoid?.(),
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
      width: 220,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn hàng hóa"
          searchModalPlaceholder="Nhập mã SKU hoặc tên hàng hóa"
          dropdownMinWidth={520}
          placeholder="Tìm mã hoặc tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) => (i === idx ? { ...l, itemLabel: val, itemId: "" } : l)),
            );
            markDirty();
          }}
          onSelect={(item) => {
            const defaultUnitPrice = Number(item.purchasePrice ?? 0) || 0;
            setLines((prev) =>
              normalizeFormLines(
                prev.map((l, i) => {
                  if (i !== idx) return l;
                  // Inherit warehouse from the nearest line above that has one,
                  // so adding items to a fresh row doesn't force re-picking kho.
                  let storageId = l.storageId;
                  let storageLabel = l.storageLabel;
                  if (!storageId) {
                    for (let j = i - 1; j >= 0; j--) {
                      if (prev[j].storageId) {
                        storageId = prev[j].storageId;
                        storageLabel = prev[j].storageLabel;
                        break;
                      }
                    }
                  }
                  return {
                    ...l,
                    itemId: item.id,
                    itemLabel: item.code,
                    unit: item.unit,
                    storageId,
                    storageLabel,
                    // Auto-fill only if user hasn't already typed a price.
                    unitPrice: l.unitPrice > 0 ? l.unitPrice : defaultUnitPrice,
                  };
                }),
              ),
            );
            markDirty();
          }}
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên hàng hóa", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[80px]", render: (it) => it.unit },
          ]}
          disabled={isView}
          onCreateNew={isView ? undefined : () => setQuickItemLineIdx(idx)}
          className="h-full"
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
    {
      key: "warehouse",
      label: "Kho",
      width: 160,
      placeholder: "Chọn kho",
      renderEditor: (row, idx) => (
        <LookupField
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn kho"
          searchModalPlaceholder="Nhập tên kho"
          dropdownMinWidth={320}
          placeholder="Chọn kho"
          value={row.storageLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, storageLabel: val, storageId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(s) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      storageId: s.id,
                      storageLabel: s.name,
                      // A bin belongs to one warehouse — clear it when the
                      // line's warehouse changes.
                      locationId: "",
                      locationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={[{ key: "name", label: "Tên kho", render: (s) => s.name }]}
          disabled={isView}
          className="h-full"
        />
      ),
    },
    {
      key: "position",
      label: "Vị trí",
      width: 160,
      placeholder: "Chọn vị trí",
      renderEditor: (row, idx) => (
        <LookupField<InventoryLocation>
          portalToBody
          enableSearchModal
          searchModalTitle="Chọn vị trí"
          searchModalPlaceholder="Nhập mã hoặc tên vị trí"
          dropdownMinWidth={360}
          placeholder={row.storageId ? "Chọn vị trí" : "Chọn kho trước"}
          value={row.locationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, locationLabel: val, locationId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, locationId: loc.id, locationLabel: loc.code }
                  : l,
              ),
            );
            markDirty();
          }}
          search={(q, p, ps) => searchLocationsForStorage(row.storageId, q, p, ps)}
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (l) => l.code },
            { key: "name", label: "Tên vị trí", render: (l) => l.name },
          ]}
          disabled={isView || !row.storageId}
          onCreateNew={
            isView || !row.storageId ? undefined : () => setQuickLocationLineIdx(idx)
          }
          className="h-full"
        />
      ),
    },
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-muted-foreground">Mục đích xuất kho</span>
            <select
              className="h-9 min-w-[260px] rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              value={purpose}
              onChange={(e) =>
                handlePurposeChange(e.target.value as GoodsIssuePurposeUI)
              }
              disabled={isView}
            >
              {MANUAL_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABELS[p]}
                </option>
              ))}
            </select>

            {reasonBucket ? (
              <div className="min-w-[320px] flex-1">
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn lý do xuất kho"
                  searchModalPlaceholder="Nhập mã hoặc tên lý do"
                  placeholder="Nhập để tìm kiếm"
                  value={reasonLabel}
                  onValueChange={(v) => {
                    setReasonLabel(v);
                    setReasonId("");
                    markDirty();
                  }}
                  onSelect={(r) => {
                    setReasonId(r.id);
                    setReasonLabel(r.name);
                    markDirty();
                  }}
                  search={searchReasons}
                  itemKey={(r) => r.id}
                  renderItem={(r) => r.name}
                  renderMeta={(r) => r.code}
                  columns={[
                    { key: "name", label: "Lý do", render: (r) => r.name },
                    {
                      key: "code",
                      label: "Mã",
                      className: "w-[140px] font-mono text-xs",
                      render: (r) => r.code,
                    },
                  ]}
                  disabled={isView}
                  onCreateNew={
                    isView ? undefined : () => setQuickReasonBucket(reasonBucket)
                  }
                />
              </div>
            ) : null}

            {purpose === "TRANSFER_OUT" ? (
              <div className="min-w-[320px] flex-1">
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn cửa hàng đích"
                  searchModalPlaceholder="Nhập tên cửa hàng"
                  placeholder="Chọn cửa hàng đích"
                  value={targetBranchLabel}
                  onValueChange={(v) => {
                    setTargetBranchLabel(v);
                    setTargetBranchId("");
                  }}
                  onSelect={(b) => {
                    setTargetBranchId(b.id);
                    setTargetBranchLabel(b.name);
                    const autoNotes = `Xuất kho hàng hóa điều chuyển đến cửa hàng ${b.name}`;
                    setNotes(autoNotes);
                    notesAutoFilledRef.current = true;
                    markDirty();
                  }}
                  search={searchBranches}
                  itemKey={(b) => b.id}
                  renderItem={(b) => b.name}
                  renderMeta={(b) => b.address ?? ""}
                  columns={[
                    { key: "name", label: "Tên cửa hàng", render: (b) => b.name },
                    { key: "address", label: "Địa chỉ", render: (b) => b.address ?? "—" },
                  ]}
                  disabled={isView}
                />
              </div>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <FieldRow label="Đối tượng">
              <div className="flex items-stretch gap-2">
                <LookupField
                  enableSearchModal
                  searchModalTitle="Chọn đối tượng"
                  searchModalPlaceholder="Nhập mã hoặc tên khách hàng"
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  value={customerCode}
                  onValueChange={(v) => {
                    setCustomerCode(v);
                    setCustomerId("");
                    setCustomerName("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setCustomerId(c.id);
                    setCustomerCode(c.code);
                    setCustomerName(c.name);
                    markDirty();
                  }}
                  search={searchCustomers}
                  itemKey={(c) => c.id}
                  renderItem={(c) => c.name}
                  renderMeta={(c) => c.code}
                  columns={[
                    {
                      key: "code",
                      label: "Mã",
                      className: "w-[160px] font-mono",
                      render: (p) => p.code,
                    },
                    { key: "name", label: "Tên", render: (p) => p.name },
                  ]}
                  disabled={isView}
                  onCreateNew={isView ? undefined : () => setQuickCustomerOpen(true)}
                />
                <Input
                  className="flex-1"
                  placeholder="Tên đối tượng"
                  value={customerName}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </FieldRow>
            <FieldRow label="Người giao">
              <Input
                value={deliveryPerson}
                onChange={(e) => {
                  setDeliveryPerson(e.target.value);
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
                  notesAutoFilledRef.current = false;
                  markDirty();
                }}
                disabled={isView}
              />
            </FieldRow>
            <FieldRow label="Tham chiếu">
              {referenceNumber ? (
                <span className="font-mono text-sm font-medium text-foreground">
                  {referenceNumber}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
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
              <Input
                value={initial?.documentNumber ?? previewDocumentNumber ?? ""}
                readOnly
                title={
                  initial?.documentNumber
                    ? undefined
                    : "Số dự kiến — hệ thống sẽ chốt khi lưu"
                }
              />
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
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
              onClick={() => setChooseKhoOpen(true)}
            >
              Chọn kho
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover"
            >
              Nhập khẩu
            </button>
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
              setLines((prev) => normalizeFormLines([...prev, emptyLine()]));
              markDirty();
            }}
            onDeleteRow={(idx) => {
              setLines((prev) =>
                normalizeFormLines(prev.filter((_, i) => i !== idx)),
              );
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

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />

      <QuickCreateProviderDialog
        open={quickCustomerOpen}
        onClose={() => setQuickCustomerOpen(false)}
        onCreated={(p: QuickProvider) => {
          setCustomerId(p.id);
          setCustomerCode(p.code);
          setCustomerName(p.name);
          markDirty();
        }}
      />

      <QuickCreateLocationDialog
        open={quickLocationLineIdx !== null}
        onClose={() => setQuickLocationLineIdx(null)}
        onCreated={(loc: QuickLocation) => {
          const idx = quickLocationLineIdx;
          if (idx === null) return;
          const storageLabel =
            storages.find((s) => s.id === loc.storageId)?.name ?? "";
          setLines((prev) =>
            prev.map((l, i) =>
              i === idx
                ? {
                    ...l,
                    locationId: loc.id,
                    locationLabel: loc.code,
                    storageId: loc.storageId,
                    storageLabel,
                  }
                : l,
            ),
          );
          setQuickLocationLineIdx(null);
          markDirty();
        }}
        storages={storageCache}
      />

      <QuickCreateItemDialog
        open={quickItemLineIdx !== null}
        onClose={() => setQuickItemLineIdx(null)}
        onCreated={(item: QuickItem) => {
          const idx = quickItemLineIdx;
          if (idx === null) return;
          setLines((prev) =>
            normalizeFormLines(
              prev.map((l, i) =>
                i === idx
                  ? { ...l, itemId: item.id, itemLabel: item.code, unit: item.unit }
                  : l,
              ),
            ),
          );
          setQuickItemLineIdx(null);
          markDirty();
        }}
      />

      <QuickCreateIssueReasonDialog
        open={quickReasonBucket !== null}
        purpose={quickReasonBucket ?? "OTHER"}
        onClose={() => setQuickReasonBucket(null)}
        onCreated={(r: QuickIssueReason) => {
          setReasonId(r.id);
          setReasonLabel(r.name);
          setQuickReasonBucket(null);
          markDirty();
        }}
      />

      {chooseKhoOpen && (
        <ChooseWarehouseDialog
          storages={storages}
          fieldLabel="Kho xuất"
          defaultStorageId={
            getPersistableFormLines(lines).find((l) => l.storageId)?.storageId
          }
          onClose={() => setChooseKhoOpen(false)}
          onConfirm={(s) => {
            setLines((prev) =>
              prev.map((l) => ({
                ...l,
                storageId: s.id,
                storageLabel: s.name,
                locationId: "",
                locationLabel: "",
              })),
            );
            markDirty();
          }}
        />
      )}
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
