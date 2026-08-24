import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { STORAGE_LOOKUP_COLUMNS } from "../../components/forms/storage-lookup";
import { CounterpartyPickerField } from "../../components/forms/CounterpartyPickerField";
import { ChooseTransferWarehousesDialog } from "../../components/document/ChooseTransferWarehousesDialog";
import {
  getPreferredShelfBatch,
  getTransferPreferredShelfBatch,
  resolveItemSourceBatch,
  type ResolveItemSourceRow,
} from "../../api/inventory-location-preferences";
import { lookupItemByCode, type ItemLookupResult } from "../../api/item-lookup";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import { useDocumentListSelection } from "../../components/document/useDocumentListSelection";
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
  getLineKey,
  getPersistableLines,
  nextLineId,
  type KeyedFormLine,
} from "../inventory-line-normalization";
import { DocumentLineImportDialog } from "../inventory/_components/document-import/DocumentLineImportDialog";
import {
  ProductSelectDialog,
  type ProductSelectResult,
  type SelectedLine,
} from "../../components/shared/product-select/ProductSelectDialog";
import { BarcodeScanRow } from "../../components/shared/BarcodeScanRow";
import { OverstockConfirmDialog } from "../../components/document/OverstockConfirmDialog";
import {
  findOverstockRows,
  type OverstockWarningRow,
} from "../../api/overstock";
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
  counterpartyKind?: "supplier" | "customer" | "employee" | null;
  counterpartyId?: string | null;
  /** Resolved "Đối tượng" inlined by the API (NCC/KH/NV). */
  counterparty?: {
    kind: "supplier" | "customer" | "employee";
    id: string;
    code: string | null;
    name: string;
  } | null;
  attachmentIds?: string[];
  transferredAt?: string;
  /** Tổng tiền (∑ line_value), inlined by the v2 search handler. */
  totalAmount?: number;
  /** Phiếu tự sinh (kho tạm / bán hàng / xếp kệ) — chỉ xem, không sửa được. */
  isSystemGenerated?: boolean;
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
  /** Mã kho (WHxxxxxx) — cột thứ nhất của dropdown chọn kho. */
  code?: string;
  name: string;
  branchId: string;
  isMainStorage?: boolean;
  isDefaultReceiving?: boolean;
}

export function StockTransferPage() {
  // `totalAmount` is the server's SUM over every matching row, not only this
  // page — it backs the footer total.
  const [records, setRecords] = useState<
    (PaginatedResponse<Transfer> & { totals: { totalAmount: number } }) | null
  >(null);
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
        totals: { totalAmount: number };
      }>(ST_SEARCH.path, body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
        totals: data.totals,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({
        data: [],
        total: 0,
        page: 1,
        pageSize: pagination.pageSize,
        totals: { totalAmount: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, [pagination, columnFilters, period.from, period.to]);

  const loadStorages = useCallback(async () => {
    try {
      const branchId = getActiveBranchId();
      const params = new URLSearchParams({ page: "1", pageSize: "200" });
      if (branchId) params.set("branchId", branchId);
      params.set("activeOnly", "true");
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

  const getTransferId = useCallback((transfer: Transfer) => transfer.id, []);
  const {
    selectedId,
    setSelectedId,
    activeRecord: selected,
  } = useDocumentListSelection({
    rows: records?.data ?? [],
    getRowId: getTransferId,
  });

  const handleDelete = async (t: Transfer) => {
    setActionLoading(t.id);
    setConfirmDelete(null);
    try {
      // BE cancel() reverses the stock movements (returns stock) then marks the
      // posted doc CANCELLED, so it disappears from the list.
      await apiClient.post(`/inventory/stock/transfers/${t.id}/cancel`);
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

  const showTotalFooter = !loading && (records?.data.length ?? 0) > 0;

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
      // POSTED phiếu are editable — the BE reverses + reposts the stock. A voided
      // (CANCELLED) phiếu and a phiếu tự sinh (kho tạm / bán hàng / xếp kệ) are
      // not: the BE rejects both, so the button stays disabled.
      disabled:
        !selected ||
        selected.status === "CANCELLED" ||
        Boolean(selected.isSystemGenerated),
      tooltip: selected?.isSystemGenerated
        ? "Phiếu tự sinh (kho tạm / bán hàng) không sửa được. Chỉ sửa phiếu tạo bằng Thêm mới."
        : undefined,
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
      // BE cancel() reverses the stock movements before voiding a POSTED doc —
      // and rejects a phiếu tự sinh, which the owning flow (kho tạm / bán hàng /
      // xếp kệ) is responsible for.
      disabled:
        !selected ||
        selected.status === "CANCELLED" ||
        Boolean(selected.isSystemGenerated),
      tooltip: selected?.isSystemGenerated
        ? "Phiếu tự sinh (kho tạm / bán hàng) không xóa được. Chỉ xóa phiếu tạo bằng Thêm mới."
        : undefined,
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
      // Counterparty (NCC/KH/NV) for new transfers; legacy rows fall back to the
      // transporter user's name.
      render: (row) =>
        row.counterparty?.name ?? row.transporter?.fullName ?? "—",
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 150,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
      footer:
        showTotalFooter && records
          ? formatMoneyInteger(records.totals.totalAmount)
          : undefined,
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

/**
 * `lineId` is a client-only grid key — the save payload is built from explicit
 * fields (see handleSave), never by spreading a line, and it must stay that way.
 */
interface FormLine extends KeyedFormLine {
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
  lineId: nextLineId(),
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

  // Kho lưu trữ is any storage with isMainStorage = false (isMainStorage marks
  // the showroom-backing storage). The first of these — the branch's default
  // receiving warehouse when there is one — seeds a blank line and is the kho
  // proposed to the resolver, which keeps it whenever the mã is actually
  // tracked there.
  const storageWarehouses = useMemo(() => {
    const warehouses = storages
      .filter((storage) => !storage.isMainStorage)
      .sort(
        (left, right) =>
          Number(Boolean(right.isDefaultReceiving)) -
          Number(Boolean(left.isDefaultReceiving)),
      );
    return warehouses.length > 0 ? warehouses : storages;
  }, [storages]);

  const defaultStorage = storageWarehouses[0];

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

  // "Đối tượng" — supplier / customer / employee (replaces the old transporter
  // picker). Rehydrate from the resolved counterparty when re-opening a phiếu.
  const [counterpartyId, setCounterpartyId] = useState(
    initial?.counterparty?.id ?? initial?.counterpartyId ?? "",
  );
  const [counterpartyCode, setCounterpartyCode] = useState(
    initial?.counterparty?.code ?? "",
  );
  const [counterpartyName, setCounterpartyName] = useState(
    initial?.counterparty?.name ?? "",
  );
  const [counterpartyKind, setCounterpartyKind] = useState<
    "supplier" | "customer" | "employee" | ""
  >(initial?.counterpartyKind ?? "");
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
      lineId: nextLineId(),
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

  const [barcodeMode, setBarcodeMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overstockWarnings, setOverstockWarnings] = useState<
    OverstockWarningRow[] | null
  >(null);
  const [dirty, setDirty] = useState(false);
  const [chooseWarehousesOpen, setChooseWarehousesOpen] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Stable identity: the line columns are memoized on this, and a `dirty`
  // dependency would rebuild them on the first edit. Setting the same value is
  // already a no-op re-render in React, so the old guard bought nothing.
  const markDirty = useCallback(() => setDirty(true), []);

  // Read by callbacks that must stay referentially stable (the line columns are
  // memoized on them) but still need the current lines.
  const linesRef = useRef(lines);
  linesRef.current = lines;

  /**
   * Single entry point for editing one line — see GoodsReceiptFormDialog for
   * the rationale: untouched rows keep their identity so memoized grid rows
   * bail out, and a no-op patch returns `prev` so nothing re-renders at all.
   */
  const updateLine = useCallback(
    (idx: number, patch: Partial<FormLine>) => {
      setLines((prev) => {
        const current = prev[idx];
        if (!current) return prev;
        let changed = false;
        for (const key of Object.keys(patch) as (keyof FormLine)[]) {
          if (current[key] !== patch[key]) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
        const next = prev.slice();
        next[idx] = { ...current, ...patch };
        return next;
      });
      markDirty();
    },
    [markDirty],
  );

  const handleApplyDraftImport = useCallback(
    (importedRows: DocumentLineImportJobRow[]) => {
      const mapped = importedRows.flatMap((row) => {
        const normalized = row.normalizedData;
        if (!normalized) return [];
        return [
          {
            lineId: nextLineId(),
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
        params.set("activeOnly", "true");
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


  // Kho picker is fed from the page-level cached storages (already scoped to
  // the active branch), filtered/paged client-side.
  const searchStorages = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? storages.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.code ?? "").toLowerCase().includes(q),
          )
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

  // One pass instead of a filter plus two reduces, and memoized so it doesn't
  // re-run on every unrelated keystroke in the form header.
  const { totalQty, totalAmount } = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const line of lines) {
      if (!line.itemId) continue;
      qty += Number(line.quantity || 0);
      amount += lineAmount(line);
    }
    return { totalQty: qty, totalAmount: amount };
  }, [lines]);

  /**
   * `skipOverstockConfirm` = người dùng đã bấm "Tiếp tục" ở cảnh báo xuất quá
   * tồn, nên bỏ qua vòng kiểm tra và lưu luôn.
   */
  const handleSave = useCallback(async (skipOverstockConfirm = false): Promise<boolean> => {
    const persistableLines = getPersistableFormLines(lines);
    if (persistableLines.length === 0) {
      setError("Cần ít nhất 1 dòng hàng hợp lệ.");
      return false;
    }
    for (const [i, l] of persistableLines.entries()) {
      if (!l.sourceStorageId || !l.destStorageId) {
        setError(`Dòng ${i + 1}: vui lòng chọn Kho xuất và Kho nhập.`);
        return false;
      }
      if (!(Number(l.quantity) > 0)) {
        setError(`Dòng ${i + 1}: số lượng phải lớn hơn 0.`);
        return false;
      }
    }
    setSaving(true);
    setError(null);
    try {
      // Cảnh báo (không chặn) khi chuyển quá tồn — dùng chung với phiếu xuất kho.
      if (!skipOverstockConfirm) {
        const warnings = await findOverstockRows(
          persistableLines.map((l) => ({
            itemId: l.itemId,
            itemName: l.itemName || l.itemLabel,
            unit: l.unit,
            storageName: l.sourceStorageLabel,
            quantity: Number(l.quantity),
            locationId: l.sourceLocationId || undefined,
            storageId: l.sourceStorageId || undefined,
          })),
          // Sửa phiếu đã ghi sổ là đảo bút cũ rồi ghi bút mới, nên hàng của bản
          // cũ quay về kho xuất trước khi trừ số mới — không cộng lại thì dòng
          // giữ nguyên số lượng luôn bị cảnh báo dù tồn sau khi lưu không đổi.
          mode === "edit" && initial?.status === "POSTED"
            ? initial.lines.map((l) => ({
                itemId: l.itemId,
                quantity: Number(l.quantity),
                locationId: l.sourceLocationId || undefined,
                storageId: l.sourceStorageId || undefined,
              }))
            : [],
        );
        if (warnings.length > 0) {
          setOverstockWarnings(warnings);
          return false;
        }
      }

      const transferredAt =
        docDate && docTime
          ? new Date(`${docDate}T${docTime}`).toISOString()
          : undefined;
      const payload = {
        // Sổ kho cho phép âm; cảnh báo phía trên là chốt chặn duy nhất nên
        // server không được từ chối vì thiếu tồn (giống phiếu xuất kho).
        allowNegative: true,
        notes: notes || undefined,
        counterpartyKind: counterpartyKind || undefined,
        counterpartyId: counterpartyId || undefined,
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
      return true;
    } catch (err) {
      setError(getUserFacingApiErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    lines,
    notes,
    counterpartyKind,
    counterpartyId,
    docDate,
    docTime,
    initial,
    mode,
    onSaved,
  ]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = async (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      // Chỉ đóng phiếu khi lưu thành công — lưu hỏng hoặc đang chờ xác nhận
      // xuất quá tồn thì giữ form lại để người dùng xử lý tiếp.
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

  // Multi-select product picker → for each chosen item, update Số lượng/Đơn giá
  // on the existing line if the item is already in the grid, otherwise append a
  // new line (source warehouse from the default). Quantity always follows the
  // dialog; unit price only overwrites when the dialog provides a positive value
  // so re-selecting to bump quantity doesn't wipe a price already entered.
  // Same indexed batch pattern as purchase-orders: the response only updates
  // the row that still has the item + source warehouse used by the request.
  const fillPreferredSourceBatch = useCallback((
    rows: { idx: number; itemId: string; storageId: string }[],
  ) => {
    const valid = rows.filter((row) => row.itemId && row.storageId);
    if (valid.length === 0) return;
    const pairs = [
      ...new Map(
        valid.map((row) => [
          `${row.itemId}:${row.storageId}`,
          { itemId: row.itemId, storageId: row.storageId },
        ]),
      ).values(),
    ];
    void getPreferredShelfBatch(pairs)
      .then((results) => {
        const shelfByKey = new Map(
          results.map((result) => [
            `${result.itemId}:${result.storageId}`,
            result.shelf,
          ]),
        );
        setLines((currentLines) =>
          currentLines.map((line, lineIdx) => {
            const match = valid.find(
              (row) =>
                row.idx === lineIdx &&
                line.itemId === row.itemId &&
                line.sourceStorageId === row.storageId,
            );
            if (!match) return line;
            const shelf = shelfByKey.get(
              `${match.itemId}:${match.storageId}`,
            );
            if (!shelf) return line;
            return {
              ...line,
              sourceLocationId: shelf.id,
              sourceLocationLabel: `${shelf.code} · ${shelf.name}`,
            };
          }),
        );
      })
      .catch(() => {});
  }, []);

  const fillPreferredSource = useCallback(
    (idx: number, itemId: string, storageId: string) =>
      fillPreferredSourceBatch([{ idx, itemId, storageId }]),
    [fillPreferredSourceBatch],
  );

  // Kho xuất + Vị trí xuất for many mã in one request, resolved from their "Chi
  // tiết vị trí hàng hóa" rows. deprioritizeMainStorage keeps the old intent —
  // a mã arranged in both is issued from the kho lưu trữ — while still falling
  // through to the showroom for a mã that only lives there.
  const resolveItemSources = useCallback(
    async (itemIds: string[]) => {
      const unique = [...new Set(itemIds.filter(Boolean))];
      if (unique.length === 0) return new Map<string, ResolveItemSourceRow>();
      const rows = await resolveItemSourceBatch(
        unique.map((itemId) => ({
          itemId,
          ...(defaultStorage ? { preferredStorageId: defaultStorage.id } : {}),
        })),
        { deprioritizeMainStorage: true },
      ).catch(() => [] as ResolveItemSourceRow[]);
      return new Map(rows.map((row) => [row.itemId, row]));
    },
    [defaultStorage],
  );

  const sourceFieldsFrom = useCallback(
    (resolved: ResolveItemSourceRow | undefined) => ({
      sourceStorageId: resolved?.storage?.id ?? defaultStorage?.id ?? "",
      sourceStorageLabel: resolved?.storage?.name ?? defaultStorage?.name ?? "",
      sourceLocationId: resolved?.shelf?.id ?? "",
      sourceLocationLabel: resolved?.shelf
        ? `${resolved.shelf.code} · ${resolved.shelf.name}`
        : "",
    }),
    [defaultStorage],
  );

  const addLinesFromPicker = async (result: ProductSelectResult) => {
    const picked = new Map<string, SelectedLine>(
      result.lines.filter((s) => s.itemId).map((s) => [s.itemId, s]),
    );
    if (picked.size === 0) return;

    const base = getPersistableFormLines(lines);
    const existing = new Set(base.map((l) => l.itemId).filter(Boolean));

    const updated = base.map((l) => {
      const s = l.itemId ? picked.get(l.itemId) : undefined;
      if (!s) return l;
      return {
        ...l,
        quantity: s.quantity > 0 ? s.quantity : l.quantity,
        unitPrice: s.unitPrice > 0 ? String(s.unitPrice) : l.unitPrice,
      };
    });

    const added = [...picked.values()].filter((s) => !existing.has(s.itemId));
    const sources = await resolveItemSources(added.map((s) => s.itemId));
    const fresh: FormLine[] = added.map((s) => ({
      ...emptyLine(),
      itemId: s.itemId,
      itemLabel: s.sku,
      itemName: s.name,
      unit: s.unit,
      ...sourceFieldsFrom(sources.get(s.itemId)),
      quantity: s.quantity > 0 ? s.quantity : 1,
      unitPrice: s.unitPrice > 0 ? String(s.unitPrice) : "",
    }));

    setLines(normalizeLines([...updated, ...fresh]));
    markDirty();
  };

  // Resolve the preferred shelf at both the source and destination storage for
  // the given lines (those with an item + both warehouses) and fill the two Vị
  // trí columns. Best-effort: a failed lookup leaves locations untouched.
  const fillTransferLocations = useCallback(async (targetLines: FormLine[]) => {
    const keyOf = (l: {
      itemId: string;
      sourceStorageId: string;
      destStorageId: string;
    }) => `${l.itemId}:${l.sourceStorageId}:${l.destStorageId}`;
    const pairs = targetLines
      .filter((l) => l.itemId && l.sourceStorageId && l.destStorageId)
      .map((l) => ({
        itemId: l.itemId,
        sourceStorageId: l.sourceStorageId,
        destStorageId: l.destStorageId,
      }));
    if (pairs.length === 0) return;

    let rows;
    try {
      rows = await getTransferPreferredShelfBatch(pairs);
    } catch {
      return;
    }
    const byKey = new Map(rows.map((r) => [keyOf(r), r]));
    setLines((prev) =>
      prev.map((l) => {
        const r = byKey.get(keyOf(l));
        if (!r) return l;
        return {
          ...l,
          sourceLocationId: r.sourceShelf?.id ?? l.sourceLocationId,
          sourceLocationLabel: r.sourceShelf
            ? `${r.sourceShelf.code} · ${r.sourceShelf.name}`
            : l.sourceLocationLabel,
          destLocationId: r.destShelf?.id ?? l.destLocationId,
          destLocationLabel: r.destShelf
            ? `${r.destShelf.code} · ${r.destShelf.name}`
            : l.destLocationLabel,
        };
      }),
    );
  }, []);

  // "Chọn kho" → apply source + dest warehouse to every line (overwrite), then
  // auto-fill both Vị trí.
  const applyTransferWarehouses = (
    source: { id: string; name: string },
    dest: { id: string; name: string },
  ) => {
    const updated = lines.map((l) => ({
      ...l,
      sourceStorageId: source.id,
      sourceStorageLabel: source.name,
      // Locations are storage-scoped — drop the previous warehouse's shelf so
      // fillTransferLocations either repopulates a valid one or leaves it blank.
      sourceLocationId: "",
      sourceLocationLabel: "",
      destStorageId: dest.id,
      destStorageLabel: dest.name,
      destLocationId: "",
      destLocationLabel: "",
    }));
    setLines(updated);
    markDirty();
    void fillTransferLocations(updated);
  };

  // Fill the line at `idx` from a selected item — shared by the inline
  // typeahead (onSelect) and the single-fill ProductSelectDialog. Selecting an
  // item on the last row appends a fresh blank line carrying the current
  // warehouses, then auto-fills that line's locations.
  const fillLineFromItem = useCallback(async (
    idx: number,
    item: { id: string; code: string; name: string; unit: string },
  ) => {
    const current = linesRef.current[idx];
    if (!current) return;
    const sources = await resolveItemSources([item.id]);
    const filledLine: FormLine = {
      ...current,
      itemId: item.id,
      itemLabel: item.code,
      itemName: item.name,
      unit: item.unit,
      ...sourceFieldsFrom(sources.get(item.id)),
    };
    setLines((prev) => {
      const appendBlank = idx === prev.length - 1 && !prev[idx]?.itemId;
      const mapped = prev.map((line, lineIdx) =>
        lineIdx === idx ? filledLine : line,
      );
      if (appendBlank) {
        const f = mapped[idx]!;
        mapped.push({
          ...emptyLine(),
          sourceStorageId: f.sourceStorageId,
          sourceStorageLabel: f.sourceStorageLabel,
          destStorageId: f.destStorageId,
          destStorageLabel: f.destStorageLabel,
        });
      }
      return normalizeLines(mapped);
    });
    markDirty();
    void fillTransferLocations([filledLine]);
  }, [
    fillTransferLocations,
    markDirty,
    normalizeLines,
    resolveItemSources,
    sourceFieldsFrom,
  ]);

  // Barcode scan: existing item -> accumulate the quantity; new item -> add a line (default
  // source storage) then auto-fill the source/destination locations like the item-pick flow.
  const handleScanResolved = async (item: ItemLookupResult, qty: number) => {
    // linesRef chứ không phải `lines`: máy quét bắn mã kế tiếp trước khi React
    // render lại, đọc state của lần render trước sẽ thêm dòng trùng thay vì cộng
    // dồn. Mỗi nhánh dưới đây tự ghi lại ref ngay sau khi dựng mảng mới.
    const current = linesRef.current;
    const existingIdx = current.findIndex((l) => l.itemId === item.itemId);
    if (existingIdx >= 0) {
      const accumulated = current.map((l, i) =>
        i === existingIdx ? { ...l, quantity: (l.quantity || 0) + qty } : l,
      );
      linesRef.current = accumulated;
      setLines(accumulated);
      markDirty();
      return;
    }
    const sources = await resolveItemSources([item.itemId]);
    // Kho nhập phải tự kế thừa từ dòng đang có: `emptyLine()` để trống nó và
    // `sourceFieldsFrom` chỉ đụng phía xuất. Thiếu `destStorageId` thì
    // `fillTransferLocations` lọc dòng này ra và cả Kho lẫn Vị trí nhập đều trống.
    // Đường nhập mã trong bảng không dính vì nó ghi đè lên dòng cũ (`...current`).
    const dest = linesRef.current.find((l) => l.destStorageId);
    const newLine: FormLine = {
      ...emptyLine(),
      destStorageId: dest?.destStorageId ?? "",
      destStorageLabel: dest?.destStorageLabel ?? "",
      itemId: item.itemId,
      itemLabel: item.code,
      itemName: item.name,
      unit: item.unit,
      ...sourceFieldsFrom(sources.get(item.itemId)),
      quantity: qty > 0 ? qty : 1,
      unitPrice: "", // leave empty -> server computes it from cost (same as addLinesFromPicker)
    };
    // Dòng trắng kế tiếp phải mang theo hai kho, giống nhánh `appendBlank` của
    // `fillLineFromItem`: nó là dòng mà người dùng gõ mã tay sau khi quét, và
    // `fillLineFromItem` chỉ ghi đè lên dòng cũ chứ không tự dựng kho nhập.
    const appended = normalizeLines([
      ...getPersistableFormLines(linesRef.current),
      newLine,
      {
        ...emptyLine(),
        sourceStorageId: newLine.sourceStorageId,
        sourceStorageLabel: newLine.sourceStorageLabel,
        destStorageId: newLine.destStorageId,
        destStorageLabel: newLine.destStorageLabel,
      },
    ]);
    linesRef.current = appended;
    setLines(appended);
    markDirty();
    void fillTransferLocations([newLine]); // auto-fill source/destination locations like the picker flow
  };

  // Memoized: a fresh array here would rebuild every column object and every
  // renderEditor closure on each render, re-rendering all rows. Everything it
  // closes over must therefore be stable — note the absence of `lines` and of
  // the running totals (those go through `lineFooters`).
  const lineColumns = useMemo<LineColumn<FormLine>[]>(() => [
    {
      key: "itemLabel",
      label: "Mã SKU",
      width: 360,
      renderEditor: (row, idx) => (
        <div className="flex h-full items-center gap-1">
        <LookupField
          placeholder="Tìm mã/tên"
          value={row.itemLabel}
          onValueChange={(val) => updateLine(idx, { itemLabel: val, itemId: "" })}
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
          onValueChange={(val) =>
            updateLine(idx, { sourceStorageLabel: val, sourceStorageId: "" })
          }
          onSelect={(s) => {
            updateLine(idx, {
              sourceStorageId: s.id,
              sourceStorageLabel: s.name,
              // Locations are storage-scoped — drop the previous pick.
              sourceLocationId: "",
              sourceLocationLabel: "",
            });
            if (row.itemId) {
              fillPreferredSource(idx, row.itemId, s.id);
            }
          }}
          search={searchStorages}
          enableSearchModal
          searchModalTitle="Chọn kho xuất"
          searchModalPlaceholder="Nhập mã kho hoặc tên kho"
          dropdownMinWidth={420}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={STORAGE_LOOKUP_COLUMNS}
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
          onValueChange={(val) =>
            updateLine(idx, { sourceLocationLabel: val, sourceLocationId: "" })
          }
          onSelect={(loc) =>
            updateLine(idx, {
              sourceLocationId: loc.id,
              sourceLocationLabel: `${loc.code} · ${loc.name}`,
            })
          }
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
          onValueChange={(val) =>
            updateLine(idx, { destStorageLabel: val, destStorageId: "" })
          }
          onSelect={(s) =>
            updateLine(idx, {
              destStorageId: s.id,
              destStorageLabel: s.name,
              destLocationId: "",
              destLocationLabel: "",
            })
          }
          search={searchStorages}
          enableSearchModal
          searchModalTitle="Chọn kho nhập"
          searchModalPlaceholder="Nhập mã kho hoặc tên kho"
          dropdownMinWidth={420}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={() => ""}
          columns={STORAGE_LOOKUP_COLUMNS}
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
          onValueChange={(val) =>
            updateLine(idx, { destLocationLabel: val, destLocationId: "" })
          }
          onSelect={(loc) =>
            updateLine(idx, {
              destLocationId: loc.id,
              destLocationLabel: `${loc.code} · ${loc.name}`,
            })
          }
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
      renderEditor: (row, idx) => (
        <MoneyInput
          className="h-full border-0"
          value={row.quantity}
          onChange={(v) => updateLine(idx, { quantity: v === "" ? 0 : v })}
          disabled={isView}
          aria-label="Số lượng"
        />
      ),
    },
    {
      key: "unitPrice",
      label: "Đơn giá",
      width: 140,
      align: "right",
      renderEditor: (row, idx) => (
        <MoneyInput
          className="h-full border-0"
          placeholder="Tự tính"
          value={row.unitPrice === "" ? "" : Number(row.unitPrice)}
          onChange={(v) =>
            updateLine(idx, { unitPrice: v === "" ? "" : String(v) })
          }
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
  ], [
    fillLineFromItem,
    fillPreferredSource,
    isView,
    makeSearchLocations,
    searchItems,
    searchStorages,
    setProductPickerOpen,
    updateLine,
  ]);

  // Totals live here rather than on the columns: a footer embedded in a column
  // object changes the identity of `columns` on every quantity edit, which
  // would re-render every row.
  const lineFooters = useMemo<Record<string, ReactNode>>(
    () => ({
      quantity: totalQty.toLocaleString("vi-VN"),
      lineValue: formatMoneyInteger(totalAmount),
    }),
    [totalAmount, totalQty],
  );

  const handleChangeCell = useCallback(
    (idx: number, key: string, value: string | number) =>
      updateLine(idx, { [key]: value } as Partial<FormLine>),
    [updateLine],
  );

  const handleAddRow = useCallback(() => {
    setLines((prev) => normalizeLines([...prev, makeEmptyLine()]));
    markDirty();
  }, [makeEmptyLine, markDirty, normalizeLines]);

  const handleDeleteRow = useCallback(
    (idx: number) => {
      setLines((prev) => normalizeLines(prev.filter((_, i) => i !== idx)));
      markDirty();
    },
    [markDirty, normalizeLines],
  );

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
            <FieldRow label="Đối tượng">
              <div className="flex items-stretch gap-2">
                <CounterpartyPickerField
                  defaultType="all"
                  allowedTypes={["supplier", "employee"]}
                  className="w-[180px]"
                  dropdownMinWidth={500}
                  modalTitle="Chọn đối tượng"
                  modalPlaceholder="Nhập mã hoặc tên đối tượng"
                  value={counterpartyCode}
                  onValueChange={(v) => {
                    setCounterpartyCode(v);
                    setCounterpartyId("");
                    setCounterpartyName("");
                    setCounterpartyKind("");
                    markDirty();
                  }}
                  onSelect={(c) => {
                    setCounterpartyId(c.id);
                    setCounterpartyCode(c.code ?? "");
                    setCounterpartyName(c.name);
                    setCounterpartyKind(c.kind);
                    markDirty();
                  }}
                  disabled={isView}
                />
                <Input
                  className="flex-1"
                  placeholder="Tên đối tượng"
                  value={counterpartyName}
                  readOnly
                  tabIndex={-1}
                />
              </div>
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
                <input
                  type="checkbox"
                  checked={barcodeMode}
                  onChange={(e) => setBarcodeMode(e.target.checked)}
                />
                <span>Quét mã vạch</span>
              </label>
              <button
                type="button"
                className="flex items-center gap-1.5 text-primary-blue transition-colors hover:text-primary-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
                disabled={storages.length === 0}
                onClick={() => setChooseWarehousesOpen(true)}
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
          <>
            {barcodeMode && (
              <BarcodeScanRow
                lookup={lookupItemByCode}
                onResolved={handleScanResolved}
                getSku={(i) => i.code}
                getName={(i) => i.name}
                disabled={isView}
              />
            )}
            <LineItemGrid
              columns={lineColumns}
              rows={lines}
              footers={lineFooters}
              getRowKey={getLineKey}
              onChangeCell={handleChangeCell}
              onDeleteRow={handleDeleteRow}
              onAddRow={handleAddRow}
              showAddRow={!isView}
              showRowActions={!isView}
            />
          </>
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
          activeOnly
          onOpenChange={setProductPickerOpen}
          showQuantityPrice
          defaultUnitPriceSource="none"
          onConfirm={addLinesFromPicker}
        />
      )}

      {/* Truyền nguyên storage: cắt xuống {id, name} là mất `code`, và cột
          "Mã kho" của dropdown chọn kho rơi về "—". */}
      {chooseWarehousesOpen && (
        <ChooseTransferWarehousesDialog
          storages={storages}
          defaultSourceId={defaultStorage?.id}
          onClose={() => setChooseWarehousesOpen(false)}
          onConfirm={({ source, dest }) => applyTransferWarehouses(source, dest)}
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

      {overstockWarnings && (
        <OverstockConfirmDialog
          rows={overstockWarnings}
          loading={saving}
          onCancel={() => setOverstockWarnings(null)}
          onConfirm={() => {
            setOverstockWarnings(null);
            void handleSave(true);
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
