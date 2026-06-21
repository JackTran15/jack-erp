import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppModal,
  Button,
  DocumentFormDialog,
  DocumentListShell,
  formatMoneyInteger,
  Input,
  LineItemGrid,
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
  Save,
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
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import {
  DEFAULT_PAGINATION,
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnCompareOp,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  ensureTrailingBlankLine,
  getPersistableLines,
} from "../inventory-line-normalization";
import { DocumentLineImportDialog } from "../inventory/_components/document-import/DocumentLineImportDialog";
import {
  ProductSelectDialog,
  type ProductSelectResult,
} from "../../components/shared/product-select/ProductSelectDialog";
import type { DocumentLineImportJobRow } from "../inventory/_components/document-import/document-line-import.types";

type TransferStatus = "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

/** Server-side CQRS search config — filterable columns map to the v2 body. */
const ST_SEARCH: V2SearchConfig = {
  path: "/v2/inventory/stock/transfers/search",
  fields: {
    documentNumber: "string",
    party: "string",
    notes: "string",
    date: "date-compare",
    totalAmount: "compare",
  },
};

const FILTER_KEYS = ["date", "documentNumber", "party", "totalAmount", "notes"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce((acc, k) => {
    acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
    return acc;
  }, {} as Record<FilterKey, ColumnFilter>);
}

function getActiveBranchId(): string | null {
  return (
    localStorage.getItem("active_branch_id") ??
    localStorage.getItem("branch_id")
  );
}

interface TransferLine {
  id?: string;
  itemId: string;
  sourceStorageId?: string;
  destinationStorageId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  quantity: number;
  unitPrice?: string | null;
  lineValue?: string | null;
  notes?: string;
  item?: { id: string; code: string; name: string; unit?: string } | null;
  sourceStorage?: { id: string; name: string } | null;
  destinationStorage?: { id: string; name: string } | null;
  sourceLocation?: { id: string; code: string; name: string } | null;
  destinationLocation?: { id: string; code: string; name: string } | null;
}

interface Transfer {
  id: string;
  documentNumber?: string;
  status: TransferStatus;
  sourceLocationId?: string;
  destinationLocationId?: string;
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  transporterUserId?: string;
  transporter?: { id: string; fullName: string } | null;
  attachmentIds?: string[];
  transferredAt?: string;
  /** Tổng tiền (∑ line_value), inlined by the v2 search handler. */
  totalAmount?: number;
  lines: TransferLine[];
  createdAt: string;
  approvedAt?: string;
  postedAt?: string;
}

/** Tổng tiền for a row — prefer the BE-computed value, else sum line values. */
function transferTotal(t: Transfer): number {
  if (t.totalAmount != null) return Number(t.totalAmount);
  return t.lines.reduce((s, l) => s + Number(l.lineValue ?? 0), 0);
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface InventoryItem {
  id: string;
  code: string;
  name: string;
  unit: string;
}

interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  branchId: string;
}

interface InventoryStorage {
  id: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
}

interface EmployeeOption {
  id: string;
  code: string | null;
  firstName: string;
  lastName: string;
}

export function StockTransferPage() {
  const [records, setRecords] = useState<PaginatedResponse<Transfer> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Transfer | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const body = buildV2Body(
        ST_SEARCH,
        columnFilters as unknown as Record<string, ColumnFilter>,
        pagination.page,
        pagination.pageSize,
      );
      // The PeriodFilter (Tháng này / Từ–Đến ngày) constrains the transfer date
      // range server-side, AND-combined with the per-column Ngày filter.
      if (period.from || period.to) {
        body.dateRange = {
          ...(period.from ? { from: period.from } : {}),
          ...(period.to ? { to: period.to } : {}),
        };
      }
      const { data } = await apiClient.post<{
        data: Transfer[];
        total: number;
        page: number;
        limit: number;
      }>(ST_SEARCH.path, body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination, columnFilters, period.from, period.to]);

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
      // best-effort; the Kho selector falls back to an empty list
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  const selected = useMemo(
    () => records?.data.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

  const handleDelete = async (t: Transfer) => {
    setActionLoading(t.id);
    try {
      // BE cancel() reverses the stock movements (returns stock) then marks the
      // posted doc CANCELLED, so it disappears from the list.
      await apiClient.post(`/inventory/stock/transfers/${t.id}/cancel`);
      setConfirmDelete(null);
      if (selectedId === t.id) setSelectedId(null);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Any filter edit resets to page 1 so the server result starts from the top.
  const resetPage = useCallback(
    () => setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 })),
    [],
  );

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], mode },
        }));
        resetPage();
      },
      onValueChange: (key: string, value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], value },
        }));
        resetPage();
      },
      onRangeChange: (key: string, part: "from" | "to", value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], [part]: value },
        }));
        resetPage();
      },
      onCompareOpChange: (key: string, compareOp: ColumnCompareOp) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as FilterKey]: { ...prev[key as FilterKey], compareOp },
        }));
        resetPage();
      },
    }),
    [columnFilters, resetPage],
  );

  const totalSum = useMemo(
    () => (records?.data ?? []).reduce((s, r) => s + transferTotal(r), 0),
    [records],
  );

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setEditing(null);
        setDialogMode("create");
      },
    },
    {
      id: "duplicate",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selected,
      // Open the create form prefilled from the selected phiếu (a fresh doc:
      // drop the document number so the new one is generated on save).
      onClick: () => {
        if (!selected) return;
        setEditing({ ...selected, documentNumber: undefined });
        setDialogMode("create");
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => {
        if (!selected) return;
        setEditing(selected);
        setDialogMode("view");
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      // POSTED phiếu are editable — the BE reverses + reposts the stock. Only a
      // voided (CANCELLED) phiếu cannot be edited.
      disabled: !selected || selected.status === "CANCELLED",
      onClick: () => {
        if (!selected) return;
        setEditing(selected);
        setDialogMode("edit");
      },
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      // BE cancel() reverses the stock movements before voiding a POSTED doc.
      disabled: !selected || selected.status === "CANCELLED",
      onClick: () => selected && setConfirmDelete(selected),
    },
    { id: "sep1", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: () => void loadRecords() },
  ];

  const columns: TableColumn<Transfer>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 130,
      filterKind: "date-compare",
      render: (row) =>
        new Date(row.transferredAt ?? row.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu chuyển",
      width: 160,
      render: (row) => (
        <button
          type="button"
          className="text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedId(row.id);
            setEditing(row);
            setDialogMode("view");
          }}
          title={row.documentNumber ?? row.id}
        >
          {row.documentNumber ?? `#${row.id.slice(0, 8)}`}
        </button>
      ),
    },
    {
      key: "party",
      label: "Đối tượng",
      width: 200,
      render: (row) => row.transporter?.fullName ?? "—",
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 150,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (row) => formatMoneyInteger(transferTotal(row)),
    },
    {
      key: "notes",
      label: "Diễn giải",
      render: (row) => row.notes ?? "",
    },
  ];

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Chuyển kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="stock-transfer" />}
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
            <span className="text-base font-semibold">
              {formatMoneyInteger(totalSum)}
            </span>
          </div>
        }
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
        detailPanel={<DetailPanel transfer={selected} />}
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu chuyển kho."
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
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
          columnFilterControl={columnFilterControl}
        />
      </DocumentListShell>

      {dialogMode && (
        <TransferFormDialog
          mode={dialogMode}
          initial={editing}
          storages={storages}
          actionLoading={!!actionLoading}
          onClose={() => {
            setDialogMode(null);
            setEditing(null);
          }}
          onSaved={async () => {
            setDialogMode(null);
            setEditing(null);
            await loadRecords();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa phiếu chuyển kho"
          message={`Xác nhận xóa phiếu ${confirmDelete.documentNumber ?? confirmDelete.id.slice(0, 8)}? Tồn kho đã chuyển sẽ được hoàn lại (đảo bút toán).`}
          confirmLabel="Xóa phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void handleDelete(confirmDelete)}
        />
      )}
    </>
  );
}

// ─── Detail panel (selected transfer's lines) ────────────────────────────────

function DetailPanel({ transfer }: { transfer: Transfer | null }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {!transfer ? (
        <p className="text-sm text-muted-foreground">Chọn một phiếu để xem chi tiết.</p>
      ) : transfer.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Phiếu này chưa có dòng hàng.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">Mã SKU</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Tên hàng hóa</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Kho xuất</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Vị trí xuất</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Kho nhập</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Vị trí nhập</th>
              <th className="border-r px-2 py-1.5 text-left font-medium">Đơn vị tính</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Số lượng</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Đơn giá</th>
              <th className="border-r px-2 py-1.5 text-right font-medium">Thành tiền</th>
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((line) => {
              const amount =
                line.lineValue != null
                  ? Number(line.lineValue)
                  : Number(line.unitPrice ?? 0) * Number(line.quantity);
              return (
                <tr key={line.id ?? line.itemId} className="border-b">
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {line.item?.code ?? line.itemId.slice(0, 8)}
                  </td>
                  <td className="border-r px-2 py-1">{line.item?.name ?? "—"}</td>
                  <td className="border-r px-2 py-1">{line.sourceStorage?.name ?? "—"}</td>
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {line.sourceLocation?.code ?? "—"}
                  </td>
                  <td className="border-r px-2 py-1">{line.destinationStorage?.name ?? "—"}</td>
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {line.destinationLocation?.code ?? "—"}
                  </td>
                  <td className="border-r px-2 py-1">{line.item?.unit ?? "—"}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {Number(line.quantity)}
                  </td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(Number(line.unitPrice ?? 0))}
                  </td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {formatMoneyInteger(amount)}
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

// ─── Form dialog ─────────────────────────────────────────────────────────────

interface FormLine {
  itemId: string;
  itemLabel: string;
  itemName: string;
  unit: string;
  sourceStorageId: string;
  sourceStorageLabel: string;
  sourceLocationId: string;
  sourceLocationLabel: string;
  destStorageId: string;
  destStorageLabel: string;
  destLocationId: string;
  destLocationLabel: string;
  quantity: number;
  /** Export unit price as raw text; blank = let the server auto-compute from cost. */
  unitPrice: string;
  notes: string;
}

const emptyLine = (): FormLine => ({
  itemId: "",
  itemLabel: "",
  itemName: "",
  unit: "",
  sourceStorageId: "",
  sourceStorageLabel: "",
  sourceLocationId: "",
  sourceLocationLabel: "",
  destStorageId: "",
  destStorageLabel: "",
  destLocationId: "",
  destLocationLabel: "",
  quantity: 1,
  unitPrice: "",
  notes: "",
});

const getPersistableFormLines = (nextLines: FormLine[]) =>
  getPersistableLines(nextLines);

const lineAmount = (l: FormLine) =>
  (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0);

function TransferFormDialog({
  mode,
  initial,
  storages,
  actionLoading,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit" | "view";
  initial: Transfer | null;
  storages: InventoryStorage[];
  actionLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isView = mode === "view";

  // Default new lines' Kho xuất to the active branch's main storage (list is
  // main-first) so the common single-warehouse case is one fewer click.
  const defaultStorage = useMemo(
    () => storages.find((s) => s.isMainStorage) ?? storages[0],
    [storages],
  );

  const makeEmptyLine = useCallback(
    (): FormLine => ({
      ...emptyLine(),
      sourceStorageId: defaultStorage?.id ?? "",
      sourceStorageLabel: defaultStorage?.name ?? "",
    }),
    [defaultStorage],
  );
  const normalizeLines = useCallback(
    (nextLines: FormLine[]) => ensureTrailingBlankLine(nextLines, makeEmptyLine),
    [makeEmptyLine],
  );

  const [transporterUserId, setTransporterUserId] = useState(
    initial?.transporterUserId ?? "",
  );
  const [transporterLabel, setTransporterLabel] = useState(
    initial?.transporter?.fullName ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    (initial?.transferredAt ?? initial?.createdAt ?? new Date().toISOString()).slice(
      0,
      10,
    ),
  );
  const [docTime, setDocTime] = useState(() => {
    const base = initial?.transferredAt ?? initial?.createdAt;
    const d = base ? new Date(base) : new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!initial) return [makeEmptyLine()];
    if (initial.lines.length === 0) return isView ? [] : [makeEmptyLine()];

    const initialLines: FormLine[] = initial.lines.map((l) => ({
      itemId: l.itemId,
      itemLabel: l.item?.code ?? l.itemId.slice(0, 8),
      itemName: l.item?.name ?? "",
      unit: l.item?.unit ?? "",
      sourceStorageId: l.sourceStorageId ?? "",
      sourceStorageLabel: l.sourceStorage?.name ?? "",
      sourceLocationId: l.sourceLocationId ?? "",
      sourceLocationLabel: l.sourceLocation
        ? `${l.sourceLocation.code} · ${l.sourceLocation.name}`
        : "",
      destStorageId: l.destinationStorageId ?? "",
      destStorageLabel: l.destinationStorage?.name ?? "",
      destLocationId: l.destinationLocationId ?? "",
      destLocationLabel: l.destinationLocation
        ? `${l.destinationLocation.code} · ${l.destinationLocation.name}`
        : "",
      quantity: Number(l.quantity),
      unitPrice: l.unitPrice != null ? String(Number(l.unitPrice)) : "",
      notes: l.notes ?? "",
    }));

    return isView ? initialLines : normalizeLines(initialLines);
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const handleApplyDraftImport = useCallback(
    (importedRows: DocumentLineImportJobRow[]) => {
      const mapped = importedRows.flatMap((row) => {
        const normalized = row.normalizedData;
        if (!normalized) return [];
        return [
          {
            itemId: normalized.itemId,
            itemLabel: normalized.itemCode,
            itemName: normalized.itemName,
            unit: normalized.unit,
            sourceStorageId: normalized.sourceStorageId ?? "",
            sourceStorageLabel: normalized.sourceStorageName ?? "",
            sourceLocationId: normalized.sourceLocationId ?? "",
            sourceLocationLabel: normalized.sourceLocationCode ?? "",
            destStorageId: normalized.destinationStorageId ?? "",
            destStorageLabel: normalized.destinationStorageName ?? "",
            destLocationId: normalized.destinationLocationId ?? "",
            destLocationLabel: normalized.destinationLocationCode ?? "",
            quantity: normalized.quantity,
            unitPrice:
              normalized.unitPrice == null ? "" : String(normalized.unitPrice),
            notes: normalized.note,
          },
        ];
      });
      setLines(normalizeLines(mapped));
      setDirty(true);
    },
    [normalizeLines],
  );

  const searchItems = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
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

  // Locations are scoped to a line's chosen Kho. Returns a search fn bound to
  // that storage; empty storage yields no results so the user picks a Kho first.
  const makeSearchLocations = useCallback(
    (lineStorageId: string) =>
      async (query: string, page: number, pageSize?: number) => {
        if (!lineStorageId) return { items: [], hasMore: false, total: 0 };
        const effectivePageSize = pageSize ?? 20;
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(effectivePageSize),
          storageId: lineStorageId,
        });
        if (query.trim()) params.set("search", query.trim());
        const { data } = await apiClient.get<PaginatedResponse<InventoryLocation>>(
          `/inventory/locations?${params}`,
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

  // Transporter picker — employees are users (mã NV = user code).
  const searchEmployees = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const effectivePageSize = pageSize ?? 20;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(effectivePageSize),
      });
      if (query.trim()) params.set("search", query.trim());
      const { data } = await apiClient.get<PaginatedResponse<EmployeeOption>>(
        `/admin/users?${params}`,
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

  const employeeLabel = (e: EmployeeOption) =>
    `${e.code ? `${e.code} · ` : ""}${e.firstName} ${e.lastName}`.trim();

  // Kho picker is fed from the page-level cached storages (already scoped to
  // the active branch), filtered/paged client-side.
  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? storages.filter((s) => s.name.toLowerCase().includes(q))
        : storages;
      const effectivePageSize = pageSize ?? 20;
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

  const summaryLines = getPersistableFormLines(lines);
  const totalQty = summaryLines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const totalAmount = summaryLines.reduce((s, l) => s + lineAmount(l), 0);

  const handleSave = useCallback(async () => {
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      setError("Cần ít nhất 1 dòng hàng hợp lệ.");
      return;
    }
    for (const [i, l] of persistableLines.entries()) {
      if (!l.sourceStorageId || !l.destStorageId) {
        setError(`Dòng ${i + 1}: vui lòng chọn Kho xuất và Kho nhập.`);
        return;
      }
      if (!(Number(l.quantity) > 0)) {
        setError(`Dòng ${i + 1}: số lượng phải lớn hơn 0.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const transferredAt =
        docDate && docTime
          ? new Date(`${docDate}T${docTime}`).toISOString()
          : undefined;
      const payload = {
        notes: notes || undefined,
        transporterUserId: transporterUserId || undefined,
        transferredAt,
        lines: persistableLines.map((l) => ({
          itemId: l.itemId,
          sourceStorageId: l.sourceStorageId,
          destinationStorageId: l.destStorageId,
          sourceLocationId: l.sourceLocationId || undefined,
          destinationLocationId: l.destLocationId || undefined,
          quantity: Number(l.quantity),
          unitPrice: l.unitPrice.trim() !== "" ? Number(l.unitPrice) : undefined,
          notes: l.notes || undefined,
        })),
      };
      if (initial && mode === "edit") {
        await apiClient.patch(`/inventory/stock/transfers/${initial.id}`, payload);
        toast.success("Đã cập nhật phiếu chuyển kho.");
      } else {
        // "Lưu" creates and posts atomically — the phiếu lands "Đã thực hiện"
        // (Số phiếu + ghi sổ kho) ngay, hiển thị trong báo cáo lập tức.
        await apiClient.post("/inventory/stock/transfers", payload);
        toast.success("Đã lưu và chuyển kho.");
      }
      setDirty(false);
      await onSaved();
    } catch (err) {
      setError(getUserFacingApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [lines, notes, transporterUserId, docDate, docTime, initial, mode, onSaved]);

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
        setTransporterUserId("");
        setTransporterLabel("");
        setNotes("");
        setLines([makeEmptyLine()]);
        setDirty(false);
        setError(null);
      },
    },
    {
      id: "save",
      label: "Lưu",
      icon: Save,
      disabled: isView || saving,
      onClick: () => void handleSave(),
    },
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  // Multi-select product picker → append one line per chosen item (dedupe by itemId),
  // pre-filling Số lượng/Đơn giá from the dialog and the source warehouse from the default.
  const addLinesFromPicker = (result: ProductSelectResult) => {
    const existing = new Set(lines.map((l) => l.itemId).filter(Boolean));
    const sourceStorageId = defaultStorage?.id ?? "";
    const sourceStorageLabel = defaultStorage?.name ?? "";
    const fresh: FormLine[] = result.lines
      .filter((s) => s.itemId && !existing.has(s.itemId))
      .map((s) => ({
        ...emptyLine(),
        itemId: s.itemId,
        itemLabel: s.sku,
        itemName: s.name,
        unit: s.unit,
        sourceStorageId,
        sourceStorageLabel,
        quantity: s.quantity > 0 ? s.quantity : 1,
        unitPrice: s.unitPrice > 0 ? String(s.unitPrice) : "",
      }));
    if (fresh.length === 0) return;
    const base = getPersistableFormLines(lines);
    setLines(normalizeLines([...base, ...fresh]));
    markDirty();
  };

  // Fill the line at `idx` from a selected item — shared by the inline
  // typeahead (onSelect) and the single-fill ProductSelectDialog.
  const fillLineFromItem = (
    idx: number,
    item: { id: string; code: string; name: string; unit: string },
  ) => {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              itemId: item.id,
              itemLabel: item.code,
              itemName: item.name,
              unit: item.unit,
            }
          : l,
      ),
    );
    markDirty();
  };

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 360,
      renderEditor: (row, idx) => (
        <div className="flex h-full items-center gap-1">
        <LookupField
          placeholder="Tìm mã/tên"
          value={row.itemLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx ? { ...l, itemLabel: val, itemId: "" } : l,
              ),
            );
            markDirty();
          }}
          onSelect={(item) => fillLineFromItem(idx, item)}
          search={searchItems}
          onSearchButtonClick={() => setProductPickerOpen(true)}
          itemKey={(it) => it.id}
          renderItem={(it) => it.name}
          renderMeta={(it) => `${it.code} · ${it.unit}`}
          columns={[
            { key: "code", label: "Mã", className: "w-[120px] font-mono", render: (it) => it.code },
            { key: "name", label: "Tên", render: (it) => it.name },
            { key: "unit", label: "ĐVT", className: "w-[60px]", render: (it) => it.unit },
          ]}
          disabled={isView}
          className="h-full flex-1"
        />
        </div>
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 280,
      type: "readonly",
      getValue: (r) => r.itemName,
    },
    {
      key: "sourceStorageLabel",
      label: "Kho xuất",
      width: 220,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Chọn kho"
          value={row.sourceStorageLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, sourceStorageLabel: val, sourceStorageId: "" }
                  : l,
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
                      sourceStorageId: s.id,
                      sourceStorageLabel: s.name,
                      // Locations are storage-scoped — drop the previous pick.
                      sourceLocationId: "",
                      sourceLocationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchStorages}
          enableSearchModal
          searchModalTitle="Chọn kho xuất"
          searchModalPlaceholder="Nhập tên kho"
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
      key: "sourceLocationLabel",
      label: "Vị trí xuất",
      width: 220,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Mặc định"
          value={row.sourceLocationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, sourceLocationLabel: val, sourceLocationId: "" }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      sourceLocationId: loc.id,
                      sourceLocationLabel: `${loc.code} · ${loc.name}`,
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={makeSearchLocations(row.sourceStorageId)}
          enableSearchModal
          searchModalTitle="Chọn vị trí xuất"
          searchModalPlaceholder="Nhập mã/tên vị trí"
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView || !row.sourceStorageId}
          className="h-full"
        />
      ),
    },
    {
      key: "destStorageLabel",
      label: "Kho nhập",
      width: 220,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Chọn kho"
          value={row.destStorageLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, destStorageLabel: val, destStorageId: "" }
                  : l,
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
                      destStorageId: s.id,
                      destStorageLabel: s.name,
                      destLocationId: "",
                      destLocationLabel: "",
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={searchStorages}
          enableSearchModal
          searchModalTitle="Chọn kho nhập"
          searchModalPlaceholder="Nhập tên kho"
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
      key: "destLocationLabel",
      label: "Vị trí nhập",
      width: 220,
      renderEditor: (row, idx) => (
        <LookupField
          placeholder="Mặc định"
          value={row.destLocationLabel}
          onValueChange={(val) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? { ...l, destLocationLabel: val, destLocationId: "" }
                  : l,
              ),
            );
            markDirty();
          }}
          onSelect={(loc) => {
            setLines((prev) =>
              prev.map((l, i) =>
                i === idx
                  ? {
                      ...l,
                      destLocationId: loc.id,
                      destLocationLabel: `${loc.code} · ${loc.name}`,
                    }
                  : l,
              ),
            );
            markDirty();
          }}
          search={makeSearchLocations(row.destStorageId)}
          enableSearchModal
          searchModalTitle="Chọn vị trí nhập"
          searchModalPlaceholder="Nhập mã/tên vị trí"
          itemKey={(loc) => loc.id}
          renderItem={(loc) => loc.name}
          renderMeta={(loc) => loc.code}
          disabled={isView || !row.destStorageId}
          className="h-full"
        />
      ),
    },
    { key: "unit", label: "ĐVT", width: 100, type: "readonly", getValue: (r) => r.unit || "—" },
    {
      key: "quantity",
      label: "Số lượng",
      width: 110,
      type: "number",
      align: "right",
      filterSymbol: "≤",
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 140,
      align: "right",
      renderEditor: (row, idx) => (
        <Input
          type="number"
          min={0}
          className="h-full border-0 text-right tabular-nums"
          placeholder="Tự tính"
          value={row.unitPrice}
          onChange={(e) => {
            const val = e.target.value;
            setLines((prev) =>
              prev.map((l, i) => (i === idx ? { ...l, unitPrice: val } : l)),
            );
            markDirty();
          }}
          disabled={isView}
        />
      ),
    },
    {
      key: "lineValue",
      label: "Thành tiền",
      width: 150,
      type: "readonly",
      align: "right",
      getValue: (r) => (r.itemId ? formatMoneyInteger(lineAmount(r)) : ""),
    },
    { key: "notes", label: "Ghi chú", width: 200 },
  ];

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(o) => {
          if (!o) requestClose();
        }}
        title={mode === "create" ? "Thêm mới phiếu chuyển kho" : `Phiếu chuyển kho ${initial?.documentNumber ?? ""}`}
        toolbarItems={dialogToolbar}
        generalInfo={
          <>
            <FieldRow label="Người vận chuyển">
              <LookupField
                placeholder="Chọn người vận chuyển"
                value={transporterLabel}
                onValueChange={(v) => {
                  setTransporterLabel(v);
                  setTransporterUserId("");
                  markDirty();
                }}
                onSelect={(e) => {
                  setTransporterUserId(e.id);
                  setTransporterLabel(employeeLabel(e));
                  markDirty();
                }}
                search={searchEmployees}
                enableSearchModal
                searchModalTitle="Chọn người vận chuyển"
                searchModalPlaceholder="Nhập mã hoặc tên nhân viên"
                itemKey={(e) => e.id}
                renderItem={(e) => `${e.firstName} ${e.lastName}`.trim()}
                renderMeta={(e) => e.code ?? ""}
                columns={[
                  { key: "code", label: "Mã NV", className: "w-[100px] font-mono", render: (e) => e.code ?? "" },
                  { key: "name", label: "Họ tên", render: (e) => `${e.firstName} ${e.lastName}`.trim() },
                ]}
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
            <FieldRow label="Tài liệu đính kèm">
              <Button type="button" variant="outline" size="sm" disabled>
                Tải tệp …
              </Button>
            </FieldRow>
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu chuyển">
              <Input
                value={initial?.documentNumber ?? ""}
                readOnly
                placeholder={initial ? undefined : "Hệ thống tự sinh khi lưu"}
              />
            </FieldRow>
            <FieldRow label="Ngày chuyển">
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
            <FieldRow label="Giờ chuyển">
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
          !isView ? (
            <>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" disabled />
                <span>Quét mã vạch</span>
              </label>
              <button
                type="button"
                className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!defaultStorage}
                onClick={() => {
                  if (!defaultStorage) return;
                  setLines((prev) =>
                    normalizeLines(
                      prev.map((line) => ({
                        ...line,
                        sourceStorageId:
                          line.sourceStorageId || defaultStorage.id,
                        sourceStorageLabel:
                          line.sourceStorageLabel || defaultStorage.name,
                      })),
                    ),
                  );
                  markDirty();
                }}
              >
                Chọn kho
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Nhập khẩu
              </button>
            </>
          ) : undefined
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
            onDeleteRow={(idx) => {
              setLines((prev) =>
                normalizeLines(prev.filter((_, i) => i !== idx)),
              );
              markDirty();
            }}
            onAddRow={() => {
              setLines((prev) => normalizeLines([...prev, makeEmptyLine()]));
              markDirty();
            }}
            showAddRow={!isView}
            showRowActions={!isView}
          />
        }
        footerSummary={
          <div className="flex items-center justify-between">
            <span>Số dòng = {lines.length}</span>
            <span className="flex items-center gap-6">
              <span>
                Số lượng: <strong className="ml-1">{totalQty}</strong>
              </span>
              <span>
                Tổng tiền:{" "}
                <strong className="ml-1">{formatMoneyInteger(totalAmount)}</strong>
              </span>
            </span>
          </div>
        }
      />

      {error && (
        <AppModal open onOpenChange={() => setError(null)} title="Lỗi" defaultWidth={420} defaultHeight={220}>
          <p className="text-sm text-destructive">{error}</p>
        </AppModal>
      )}

      <UnsavedChangesDialog
        open={unsavedOpen}
        onOpenChange={setUnsavedOpen}
        onChoose={(c) => void handleUnsavedChoice(c)}
        saveDisabled={actionLoading || saving}
      />

      {productPickerOpen && (
        <ProductSelectDialog
          open
          onOpenChange={setProductPickerOpen}
          showQuantityPrice
          defaultUnitPriceSource="none"
          onConfirm={addLinesFromPicker}
        />
      )}

      <DocumentLineImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="stock-transfers"
        title="Nhập khẩu hàng hóa chuyển kho"
        description="Nhập khẩu hàng hóa vào phiếu chuyển kho:"
        templateFileName="NhapKhauChuyenKho.xls"
        errorFileName="dong-chuyen-kho-loi.xlsx"
        successMessage={(count) =>
          `${count} dòng đã được đưa vào phiếu chuyển kho.`
        }
        columns={[
          { key: "sku", label: "Mã SKU", rawKey: "Mã SKU", width: 130 },
          {
            key: "sourceStorage",
            label: "Kho xuất",
            rawKey: "Kho xuất",
            width: 140,
          },
          {
            key: "destinationStorage",
            label: "Kho nhập",
            rawKey: "Kho nhập",
            width: 140,
          },
          {
            key: "quantity",
            label: "Số lượng",
            rawKey: "Số lượng",
            width: 110,
            align: "right",
          },
          {
            key: "unitPrice",
            label: "Đơn giá",
            normalizedKey: "unitPrice",
            rawKey: "Đơn giá",
            width: 130,
            align: "right",
          },
        ]}
        onApplyDraft={handleApplyDraftImport}
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
