import { useCallback, useMemo, useRef, useState } from "react";
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
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  MOCK_EMPLOYEES,
  MOCK_ITEMS,
  MOCK_LOCATIONS,
  MOCK_STOCK_TRANSFERS,
  MOCK_STORAGES,
  lineSubtotal,
  nextDocumentNumber,
  transferTotal,
  type MockEmployee,
  type MockItem,
  type MockLocation,
  type MockStorage,
  type StockTransfer,
  type StockTransferLine,
  type StockTransferStatus,
} from "./StockTransferPage.fixtures";

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTER_KEYS = [
  "date",
  "documentNumber",
  "transporter",
  "totalAmount",
  "notes",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
}

// ─── Mock async search helpers (mimic the SearchListingInput contract) ───────

function mockSearch<T>(items: T[], query: string, predicate: (i: T, q: string) => boolean) {
  return new Promise<T[]>((resolve) => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((it) => predicate(it, q)) : items;
    resolve(filtered.slice(0, 8));
  });
}

const searchEmployees = (q: string) =>
  mockSearch(MOCK_EMPLOYEES, q, (e, qq) =>
    e.code.toLowerCase().includes(qq) || e.name.toLowerCase().includes(qq),
  );

const searchItems = (q: string) =>
  mockSearch(MOCK_ITEMS, q, (i, qq) =>
    i.sku.toLowerCase().includes(qq) || i.name.toLowerCase().includes(qq),
  );

const searchStorages = (q: string) =>
  mockSearch(MOCK_STORAGES, q, (s, qq) =>
    s.code.toLowerCase().includes(qq) || s.name.toLowerCase().includes(qq),
  );

const searchLocationsByStorage = (storageId: string) => (q: string) =>
  mockSearch(
    MOCK_LOCATIONS.filter((l) => !storageId || l.storageId === storageId),
    q,
    (l, qq) => l.code.toLowerCase().includes(qq) || l.name.toLowerCase().includes(qq),
  );

// ─── Page ─────────────────────────────────────────────────────────────────────

export function StockTransferPage() {
  const [transfers, setTransfers] = useState<StockTransfer[]>(MOCK_STOCK_TRANSFERS);
  const [pagination, setPagination] = useState<PaginationStateDto>({
    ...DEFAULT_PAGINATION,
    pageSize: 50,
  });
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "view" | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<StockTransfer | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StockTransfer | null>(null);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of MOCK_EMPLOYEES) map.set(e.id, e.name);
    return map;
  }, []);

  const filteredTransfers = useMemo(() => {
    const fromMs = new Date(period.from).getTime();
    const toMs = new Date(period.to).getTime() + 24 * 60 * 60 * 1000 - 1;
    return transfers
      .filter((t) => {
        const ts = new Date(t.date).getTime();
        return ts >= fromMs && ts <= toMs;
      })
      .filter((t) => {
        const num = columnFilters.documentNumber.value.trim().toLowerCase();
        return !num || t.documentNumber.toLowerCase().includes(num);
      });
  }, [transfers, period, columnFilters]);

  const pagedTransfers = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredTransfers.slice(start, start + pagination.pageSize);
  }, [filteredTransfers, pagination]);

  const selectedTransfer = useMemo(
    () => transfers.find((t) => t.id === selectedId) ?? null,
    [transfers, selectedId],
  );

  // ─── Mutations (mock) ──────────────────────────────────────────────────────

  const handleSave = useCallback(
    (input: StockTransferDraft, mode: "create" | "edit") => {
      setTransfers((prev) => {
        if (mode === "edit" && input.id) {
          return prev.map((t) =>
            t.id === input.id ? { ...t, ...toTransferRecord(input, t.documentNumber, t.status) } : t,
          );
        }
        const id = `txfr-${Date.now()}`;
        const documentNumber = nextDocumentNumber(prev);
        return [
          ...prev,
          {
            id,
            ...toTransferRecord(input, documentNumber, "DRAFT"),
          },
        ];
      });
      toast.success(mode === "edit" ? "Đã cập nhật phiếu chuyển kho." : "Đã tạo phiếu chuyển kho.");
    },
    [],
  );

  const handleDelete = (transfer: StockTransfer) => {
    setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
    if (selectedId === transfer.id) setSelectedId(null);
    setConfirmDelete(null);
    toast.success("Đã xoá phiếu chuyển kho.");
  };

  // ─── Toolbar config ────────────────────────────────────────────────────────

  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => {
        setEditingTransfer(null);
        setDialogMode("create");
      },
    },
    {
      id: "duplicate",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selectedTransfer,
      onClick: () => {
        if (!selectedTransfer) return;
        setEditingTransfer(selectedTransfer);
        setDialogMode("create");
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selectedTransfer,
      onClick: () => {
        if (!selectedTransfer) return;
        setEditingTransfer(selectedTransfer);
        setDialogMode("view");
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !selectedTransfer || selectedTransfer.status !== "DRAFT",
      onClick: () => {
        if (!selectedTransfer) return;
        setEditingTransfer(selectedTransfer);
        setDialogMode("edit");
      },
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !selectedTransfer || selectedTransfer.status === "POSTED",
      onClick: () => selectedTransfer && setConfirmDelete(selectedTransfer),
    },
    { id: "sep1", type: "separator" },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => toast.info("Dữ liệu đã được làm mới."),
    },
  ];

  // ─── Master table columns ──────────────────────────────────────────────────

  const columns: TableColumn<StockTransfer>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 110,
      render: (row) => new Date(row.date).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu chuyển",
      width: 150,
      render: (row) => (
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setEditingTransfer(row);
            setDialogMode("view");
          }}
        >
          {row.documentNumber}
        </button>
      ),
    },
    {
      key: "transporter",
      label: "Đối tượng",
      width: 200,
      render: (row) => employeeNameById.get(row.transporterId) ?? row.transporterId,
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 140,
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
    () => filteredTransfers.reduce((s, t) => s + transferTotal(t), 0),
    [filteredTransfers],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <DocumentListShell
        title="Chuyển kho"
        tabs={<InventoryTabBar activeId="stock-transfer" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
        filters={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={() => toast.info("Đã lấy dữ liệu theo khoảng thời gian.")}
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
            total={filteredTransfers.length}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: nextPageSize }))
            }
          />
        }
        detailPanel={<DetailPanel transfer={selectedTransfer} />}
      >
        <BaseDataTable
          columns={columns}
          rows={pagedTransfers}
          loading={false}
          emptyLabel="Không có dữ liệu"
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
        <StockTransferFormDialog
          mode={dialogMode}
          initial={editingTransfer}
          onClose={() => {
            setDialogMode(null);
            setEditingTransfer(null);
          }}
          onSaved={(draft) => {
            handleSave(draft, dialogMode === "edit" ? "edit" : "create");
            setDialogMode(null);
            setEditingTransfer(null);
          }}
          onRequestDelete={
            editingTransfer ? () => setConfirmDelete(editingTransfer) : undefined
          }
        />
      )}

      {confirmDelete && (
        <ConfirmActionModal
          title="Xóa phiếu chuyển kho"
          message={`Xác nhận xóa phiếu ${confirmDelete.documentNumber}? Thao tác này không thể hoàn tác.`}
          confirmLabel="Xóa phiếu"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </>
  );
}

// ─── Detail panel (selected transfer's lines) ────────────────────────────────

function DetailPanel({ transfer }: { transfer: StockTransfer | null }) {
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
            {transfer.lines.map((line) => (
              <tr key={line.id} className="border-b">
                <td className="border-r px-2 py-1">{line.sku}</td>
                <td className="border-r px-2 py-1">{line.itemName}</td>
                <td className="border-r px-2 py-1">{storageLabel(line.sourceStorageId)}</td>
                <td className="border-r px-2 py-1">{locationLabel(line.sourceLocationId)}</td>
                <td className="border-r px-2 py-1">{storageLabel(line.destinationStorageId)}</td>
                <td className="border-r px-2 py-1">{locationLabel(line.destinationLocationId)}</td>
                <td className="border-r px-2 py-1">{line.unit}</td>
                <td className="border-r px-2 py-1 text-right tabular-nums">{line.quantity}</td>
                <td className="border-r px-2 py-1 text-right tabular-nums">
                  {formatMoneyInteger(line.unitPrice)}
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

function storageLabel(id: string | undefined): string {
  if (!id) return "";
  return MOCK_STORAGES.find((s) => s.id === id)?.name ?? "";
}

function locationLabel(id: string | undefined): string {
  if (!id) return "";
  return MOCK_LOCATIONS.find((l) => l.id === id)?.code ?? "";
}

// ─── Form dialog ─────────────────────────────────────────────────────────────

interface FormLine {
  itemId: string;
  sku: string;
  itemName: string;
  unit: string;
  sourceStorageId: string;
  sourceStorageLabel: string;
  sourceLocationId: string;
  sourceLocationLabel: string;
  destinationStorageId: string;
  destinationStorageLabel: string;
  destinationLocationId: string;
  destinationLocationLabel: string;
  quantity: number;
  unitPrice: number;
  notes: string;
}

interface StockTransferDraft {
  id?: string;
  date: string;
  transporterId: string;
  notes?: string;
  lines: FormLine[];
}

const emptyLine = (): FormLine => ({
  itemId: "",
  sku: "",
  itemName: "",
  unit: "",
  sourceStorageId: "",
  sourceStorageLabel: "",
  sourceLocationId: "",
  sourceLocationLabel: "",
  destinationStorageId: "",
  destinationStorageLabel: "",
  destinationLocationId: "",
  destinationLocationLabel: "",
  quantity: 1,
  unitPrice: 0,
  notes: "",
});

function toTransferRecord(
  draft: StockTransferDraft,
  documentNumber: string,
  status: StockTransferStatus,
): Omit<StockTransfer, "id"> {
  return {
    documentNumber,
    date: draft.date,
    transporterId: draft.transporterId,
    notes: draft.notes,
    status,
    lines: draft.lines
      .filter((l) => l.itemId)
      .map<StockTransferLine>((l, idx) => ({
        id: `${documentNumber}-${idx + 1}`,
        itemId: l.itemId,
        sku: l.sku,
        itemName: l.itemName,
        sourceStorageId: l.sourceStorageId,
        sourceLocationId: l.sourceLocationId || undefined,
        destinationStorageId: l.destinationStorageId,
        destinationLocationId: l.destinationLocationId || undefined,
        unit: l.unit,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        notes: l.notes || undefined,
      })),
  };
}

function StockTransferFormDialog({
  mode,
  initial,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: "create" | "edit" | "view";
  initial: StockTransfer | null;
  onClose: () => void;
  onSaved: (draft: StockTransferDraft) => void;
  onRequestDelete?: () => void;
}) {
  const isView = mode === "view";

  const initialTransporter = useMemo(() => {
    if (!initial) return { code: "", name: "" };
    const e = MOCK_EMPLOYEES.find((x) => x.id === initial.transporterId);
    return e ? { code: e.code, name: e.name } : { code: "", name: "" };
  }, [initial]);

  const [transporterId, setTransporterId] = useState(initial?.transporterId ?? "");
  const [transporterCode, setTransporterCode] = useState(initialTransporter.code);
  const [transporterName, setTransporterName] = useState(initialTransporter.name);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [docDate, setDocDate] = useState(
    initial?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [docTime, setDocTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [lines, setLines] = useState<FormLine[]>(() =>
    initial && initial.lines.length > 0
      ? initial.lines.map((l) => ({
          itemId: l.itemId,
          sku: l.sku,
          itemName: l.itemName,
          unit: l.unit,
          sourceStorageId: l.sourceStorageId,
          sourceStorageLabel: storageLabel(l.sourceStorageId),
          sourceLocationId: l.sourceLocationId ?? "",
          sourceLocationLabel: locationLabel(l.sourceLocationId),
          destinationStorageId: l.destinationStorageId,
          destinationStorageLabel: storageLabel(l.destinationStorageId),
          destinationLocationId: l.destinationLocationId ?? "",
          destinationLocationLabel: locationLabel(l.destinationLocationId),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          notes: l.notes ?? "",
        }))
      : [emptyLine()],
  );

  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const markDirty = () => {
    if (!dirty) setDirty(true);
  };

  const updateLine = (idx: number, patch: Partial<FormLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    markDirty();
  };

  const totalQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const totalAmount = lines.reduce(
    (s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0),
    0,
  );

  const handleSaveDraft = useCallback(() => {
    if (!transporterId || lines.every((l) => !l.itemId)) {
      setError("Vui lòng chọn người vận chuyển và ít nhất một dòng hàng hợp lệ.");
      return;
    }
    setError(null);
    onSaved({
      id: initial?.id,
      date: docDate,
      transporterId,
      notes: notes || undefined,
      lines: lines.filter((l) => l.itemId),
    });
    setDirty(false);
  }, [transporterId, lines, docDate, notes, initial, onSaved]);

  const requestClose = () => {
    if (dirtyRef.current && !isView) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  const handleUnsavedChoice = (choice: UnsavedChangesChoice) => {
    if (choice === "save") {
      handleSaveDraft();
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
        setTransporterId("");
        setTransporterCode("");
        setTransporterName("");
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
      disabled: isView,
      onClick: handleSaveDraft,
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
      disabled: !initial || initial.status !== "DRAFT",
      onClick: () => toast.info("Đã hoãn phiếu (mock)."),
    },
    { id: "sep2", type: "separator" },
    { id: "print", label: "In", icon: Printer, disabled: true, onClick: () => {} },
    { id: "export", label: "Xuất khẩu", icon: CloudUpload, disabled: true, onClick: () => {} },
    { id: "help", label: "Trợ giúp", icon: HelpCircle, onClick: () => {} },
    { id: "close", label: "Đóng", icon: X, onClick: requestClose },
  ];

  const lineColumns: LineColumn<FormLine>[] = [
    {
      key: "sku",
      label: "Mã SKU",
      width: 140,
      placeholder: "Tìm mã hoặc tên",
      renderEditor: (row, idx) => (
        <SearchListingInput<MockItem>
          placeholder="Tìm mã hoặc tên"
          value={row.sku}
          onValueChange={(val) => updateLine(idx, { sku: val, itemId: "" })}
          onSelect={(item) =>
            updateLine(idx, {
              itemId: item.id,
              sku: item.sku,
              itemName: item.name,
              unit: item.unit,
              unitPrice: row.unitPrice || item.defaultPrice,
            })
          }
          search={searchItems}
          itemKey={(item) => item.id}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.sku} · ${item.unit}`}
          minChars={0}
          disabled={isView}
        />
      ),
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 220,
      type: "readonly",
      getValue: (row) => row.itemName,
    },
    {
      key: "sourceStorageLabel",
      label: "Kho xuất",
      width: 140,
      renderEditor: (row, idx) => (
        <SearchListingInput<MockStorage>
          placeholder="Chọn kho"
          value={row.sourceStorageLabel}
          onValueChange={(val) =>
            updateLine(idx, {
              sourceStorageLabel: val,
              sourceStorageId: "",
              sourceLocationId: "",
              sourceLocationLabel: "",
            })
          }
          onSelect={(s) =>
            updateLine(idx, {
              sourceStorageId: s.id,
              sourceStorageLabel: s.name,
              sourceLocationId: "",
              sourceLocationLabel: "",
            })
          }
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={(s) => s.code}
          minChars={0}
          disabled={isView}
        />
      ),
    },
    {
      key: "sourceLocationLabel",
      label: "Vị trí xuất",
      width: 110,
      renderEditor: (row, idx) => (
        <SearchListingInput<MockLocation>
          placeholder="Chọn vị trí"
          value={row.sourceLocationLabel}
          onValueChange={(val) =>
            updateLine(idx, { sourceLocationLabel: val, sourceLocationId: "" })
          }
          onSelect={(l) =>
            updateLine(idx, { sourceLocationId: l.id, sourceLocationLabel: l.code })
          }
          search={searchLocationsByStorage(row.sourceStorageId)}
          itemKey={(l) => l.id}
          renderItem={(l) => l.code}
          renderMeta={(l) => l.name}
          minChars={0}
          disabled={isView || !row.sourceStorageId}
        />
      ),
    },
    {
      key: "destinationStorageLabel",
      label: "Kho nhập",
      width: 140,
      renderEditor: (row, idx) => (
        <SearchListingInput<MockStorage>
          placeholder="Chọn kho"
          value={row.destinationStorageLabel}
          onValueChange={(val) =>
            updateLine(idx, {
              destinationStorageLabel: val,
              destinationStorageId: "",
              destinationLocationId: "",
              destinationLocationLabel: "",
            })
          }
          onSelect={(s) =>
            updateLine(idx, {
              destinationStorageId: s.id,
              destinationStorageLabel: s.name,
              destinationLocationId: "",
              destinationLocationLabel: "",
            })
          }
          search={searchStorages}
          itemKey={(s) => s.id}
          renderItem={(s) => s.name}
          renderMeta={(s) => s.code}
          minChars={0}
          disabled={isView}
        />
      ),
    },
    {
      key: "destinationLocationLabel",
      label: "Vị trí nhập",
      width: 110,
      renderEditor: (row, idx) => (
        <SearchListingInput<MockLocation>
          placeholder="Chọn vị trí"
          value={row.destinationLocationLabel}
          onValueChange={(val) =>
            updateLine(idx, {
              destinationLocationLabel: val,
              destinationLocationId: "",
            })
          }
          onSelect={(l) =>
            updateLine(idx, {
              destinationLocationId: l.id,
              destinationLocationLabel: l.code,
            })
          }
          search={searchLocationsByStorage(row.destinationStorageId)}
          itemKey={(l) => l.id}
          renderItem={(l) => l.code}
          renderMeta={(l) => l.name}
          minChars={0}
          disabled={isView || !row.destinationStorageId}
        />
      ),
    },
    {
      key: "unit",
      label: "Đơn vị tính",
      width: 90,
      type: "readonly",
      getValue: (r) => r.unit,
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
          onChange={(v) => updateLine(idx, { unitPrice: v === "" ? 0 : Number(v) })}
          disabled={isView}
        />
      ),
    },
    {
      key: "lineTotal",
      label: "Thành tiền",
      width: 130,
      type: "readonly",
      align: "right",
      filterSymbol: "≤",
      getValue: (r) =>
        formatMoneyInteger(Number(r.quantity || 0) * Number(r.unitPrice || 0)),
    },
    { key: "notes", label: "Ghi chú", width: 160 },
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
            ? "Thêm mới phiếu chuyển kho"
            : `Phiếu chuyển kho ${initial?.documentNumber ?? ""}`
        }
        toolbarItems={dialogToolbar}
        generalInfo={
          <>
            <FieldRow label="Người vận chuyển">
              <div className="flex gap-2">
                <div className="w-[140px]">
                  <SearchListingInput<MockEmployee>
                    placeholder="Mã"
                    value={transporterCode}
                    onValueChange={(v) => {
                      setTransporterCode(v);
                      setTransporterId("");
                      markDirty();
                    }}
                    onSelect={(e) => {
                      setTransporterId(e.id);
                      setTransporterCode(e.code);
                      setTransporterName(e.name);
                      markDirty();
                    }}
                    search={searchEmployees}
                    itemKey={(e) => e.id}
                    renderItem={(e) => e.name}
                    renderMeta={(e) => e.code}
                    minChars={0}
                    disabled={isView}
                  />
                </div>
                <Input
                  className="flex-1"
                  value={transporterName}
                  onChange={(e) => {
                    setTransporterName(e.target.value);
                    markDirty();
                  }}
                  disabled={isView}
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  disabled={isView}
                >
                  Tài liệu đính kèm
                </button>
                <Button type="button" variant="outline" size="sm" disabled>
                  Tải tệp …
                </Button>
              </div>
            </FieldRow>
          </>
        }
        documentInfo={
          <>
            <FieldRow label="Số phiếu chuyển">
              <Input value={initial?.documentNumber ?? ""} readOnly />
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
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" disabled />
              <span>Quét mã vạch</span>
            </label>
            <button type="button" className="flex items-center gap-1.5 text-primary hover:underline">
              Chọn kho
            </button>
            <button type="button" className="flex items-center gap-1.5 text-primary hover:underline">
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
                prev.map((l, i) =>
                  i === idx ? { ...l, [key]: value } : l,
                ),
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
                Thành tiền: <strong className="ml-1">{formatMoneyInteger(totalAmount)}</strong>
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
        onChoose={handleUnsavedChoice}
      />
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <label className="text-sm text-muted-foreground">{label}</label>
      <div>{children}</div>
    </div>
  );
}
