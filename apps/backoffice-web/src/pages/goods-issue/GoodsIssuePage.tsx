import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  DocumentListShell,
  formatMoneyInteger,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import {
  Barcode,
  Copy,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import {
  BaseDataTable,
  type TableColumn,
} from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import {
  InventoryPageTitle,
  InventoryTabBar,
} from "../../components/document/inventoryTabs";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "../../components/status/StatusBadge";
import { useDocumentListSelection } from "../../components/document/useDocumentListSelection";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../components/crud/crudV2Search";
import {
  getActiveBranchId,
  PURPOSE_LABELS,
} from "../../components/document/goods-issue-shared";
import type {
  GoodsIssue,
  GoodsIssueStatus,
  GoodsIssuePurposeUI,
  InventoryProvider,
  InventoryStorage,
  PaginatedResponse,
} from "../../components/document/goods-issue-shared";
import { GoodsIssueFormDialog } from "../../components/document/GoodsIssueFormDialog";

/** Filter keys align 1:1 with the `GoodsIssueSearchV2Dto` body fields. */
const FILTER_KEYS = [
  "date",
  "documentNumber",
  "party",
  "totalAmount",
  "notes",
  "reason",
  "purpose",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

const GI_SEARCH: V2SearchConfig = {
  path: "/v2/inventory/goods-issues/search",
  fields: {
    documentNumber: "string",
    party: "string",
    notes: "string",
    reason: "string",
    purpose: "enum",
    date: "date-range",
    totalAmount: "compare",
  },
};

function emptyColumnFilters(): Record<FilterKey, ColumnFilter> {
  return FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<FilterKey, ColumnFilter>,
  );
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

const STATUS_LABELS: Record<GoodsIssueStatus, string> = {
  DRAFT: "Chưa thực hiện",
  APPROVED: "Chưa thực hiện",
  POSTED: "Đã thực hiện",
  CANCELLED: "Đã hoãn",
};

function issueTotal(o: GoodsIssue): number {
  return o.lines.reduce((s, l) => s + lineSubtotal(l), 0);
}

function renderStatusBadge(status: GoodsIssueStatus) {
  const variant: StatusBadgeVariant =
    status === "POSTED"
      ? "success"
      : status === "CANCELLED"
        ? "danger"
        : "neutral";

  return <StatusBadge variant={variant}>{STATUS_LABELS[status]}</StatusBadge>;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function GoodsIssuePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PaginatedResponse<GoodsIssue> | null>(
    null,
  );
  const [customers, setCustomers] = useState<InventoryProvider[]>([]);
  const [storages, setStorages] = useState<InventoryStorage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [columnFilters, setColumnFilters] =
    useState<Record<FilterKey, ColumnFilter>>(emptyColumnFilters);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [dialogMode, setDialogMode] = useState<
    "create" | "edit" | "view" | null
  >(null);
  const [editingIssue, setEditingIssue] = useState<GoodsIssue | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GoodsIssue | null>(null);
  const [confirmVoid, setConfirmVoid] = useState<GoodsIssue | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const searchFilters: Record<FilterKey, ColumnFilter> = {
        ...columnFilters,
        date: {
          ...columnFilters.date,
          from: period.from,
          to: period.to,
        },
      };
      const body = buildV2Body(
        GI_SEARCH,
        searchFilters as unknown as Record<string, ColumnFilter>,
        pagination.page,
        pagination.pageSize,
      );
      const { data } = await apiClient.post<{
        data: GoodsIssue[];
        total: number;
        page: number;
        limit: number;
      }>("/v2/inventory/goods-issues/search", body);
      setRecords({
        data: data.data,
        total: data.total,
        page: data.page,
        pageSize: data.limit,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({
        data: [],
        total: 0,
        page: 1,
        pageSize: pagination.pageSize,
      });
    } finally {
      setLoading(false);
    }
  }, [pagination, columnFilters, period]);

  const loadCustomers = useCallback(async () => {
    try {
      const { data } = await apiClient.get<
        PaginatedResponse<InventoryProvider>
      >("/inventory/providers?page=1&pageSize=200");
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
    // Debounce so rapid filter typing settles into a single request.
    const t = setTimeout(() => void loadRecords(), 300);
    return () => clearTimeout(t);
  }, [loadRecords]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    const openDocumentId = (
      location.state as { openDocumentId?: string } | null
    )?.openDocumentId;
    if (!openDocumentId) return;
    void (async () => {
      try {
        const { data } = await apiClient.get<GoodsIssue>(
          `/inventory/goods-issues/${openDocumentId}`,
        );
        setSelectedId(data.id);
        setEditingIssue(data);
        setDialogMode("view");
      } catch (err) {
        toast.error(getUserFacingApiErrorMessage(err));
      } finally {
        navigate(location.pathname, { replace: true, state: null });
      }
    })();
  }, [location.pathname, location.state, navigate]);

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

  const getIssueId = useCallback((issue: GoodsIssue) => issue.id, []);
  const {
    selectedId,
    setSelectedId,
    activeRecord: selectedIssue,
  } = useDocumentListSelection({
    rows: records?.data ?? [],
    getRowId: getIssueId,
  });

  // ─── Row actions ──────────────────────────────────────────────────────────────

  const reloadAfterMutation = useCallback(async () => {
    await loadRecords();
  }, [loadRecords]);

  const handleVoid = async (issue: GoodsIssue) => {
    setActionLoading(issue.id);
    setConfirmVoid(null);
    try {
      // Hoãn = đảo bút phiếu đã thực hiện. Cùng endpoint cancel() như "Xóa",
      // nhưng với phiếu POSTED, BE sẽ đảo bút tồn kho trước khi đánh dấu huỷ.
      await apiClient.post(`/inventory/goods-issues/${issue.id}/cancel`);
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
    setConfirmDelete(null);
    try {
      await apiClient.post(`/inventory/goods-issues/${issue.id}/cancel`);
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
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void loadRecords(),
    },
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
      icon: Barcode,
      onClick: () =>
        navigate("/admin/inventory-item-barcodes", {
          state: { from: "/inventory/goods-issues" },
        }),
    },
  ];

  // ─── Master table columns ─────────────────────────────────────────────────────

  const totalSum = useMemo(
    () => (records?.data ?? []).reduce((s, r) => s + issueTotal(r), 0),
    [records],
  );
  const showTotalFooter = !loading && (records?.data.length ?? 0) > 0;

  const columns: TableColumn<GoodsIssue>[] = [
    {
      key: "date",
      label: "Ngày",
      width: 150,
      filterKind: "date-range",
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
      key: "party",
      label: "Đối tượng",
      width: 180,
      render: (row) => {
        // Prefer the resolved counterparty (covers NCC/KH/NV). Then the explicit
        // provider pick. For transfer rows with legacy/malformed providerId,
        // fall back to targetBranch before considering raw ids.
        if (row.counterparty?.name) return row.counterparty.name;
        if (row.provider?.name) return row.provider.name;
        if (row.purpose === "TRANSFER_OUT" && row.targetBranch?.name)
          return row.targetBranch.name;
        if (row.providerId)
          return (
            customerNameById.get(row.providerId) ??
            (isUuidLike(row.providerId) ? "—" : row.providerId)
          );
        return row.customerName ?? "—";
      },
    },
    {
      key: "totalAmount",
      label: "Tổng tiền",
      width: 140,
      filterKind: "number-range",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      footer: showTotalFooter ? formatMoneyInteger(totalSum) : undefined,
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
      key: "purpose",
      label: "Loại chứng từ",
      width: 200,
      filterKind: "select",
      filterPlaceholder: "Tất cả",
      filterOptions: (Object.keys(PURPOSE_LABELS) as GoodsIssuePurposeUI[]).map(
        (value) => ({ value, label: PURPOSE_LABELS[value] }),
      ),
      render: (row) => PURPOSE_LABELS[row.purpose ?? "OTHER"],
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 130,
      render: (row) => renderStatusBadge(row.status),
    },
  ];

  // Any filter edit resets to page 1 so the server result starts from the top.
  const resetPage = useCallback(
    () =>
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 })),
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
    }),
    [columnFilters, resetPage],
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
    return `XK${String(max + 1).padStart(6, "0")}`;
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
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={records?.total ?? 0}
            onPageChange={(p) =>
              setPagination((prev) => ({ ...prev, page: p }))
            }
            onPageSizeChange={(nextPageSize) =>
              setPagination((prev) => ({
                ...prev,
                page: 1,
                pageSize: nextPageSize,
              }))
            }
          />
        }
        detailPanel={
          <DetailPanel
            issue={selectedIssue}
            storageNameById={storageNameById}
          />
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
          onEdit={() => setDialogMode("edit")}
          onVoid={editingIssue ? () => setConfirmVoid(editingIssue) : undefined}
          onRequestDelete={
            editingIssue ? () => setConfirmDelete(editingIssue) : undefined
          }
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
        <p className="text-sm text-muted-foreground">
          Chọn một phiếu để xem chi tiết.
        </p>
      ) : issue.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Phiếu này chưa có dòng hàng.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Mã SKU
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Tên hàng hóa
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Kho
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Vị trí
              </th>
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Đơn vị tính
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Số lượng
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Đơn giá
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Thành tiền
              </th>
              <th className="px-2 py-1.5 text-left font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {issue.lines.map((line) => {
              const itemCode =
                line.item?.code ?? line.itemCode ?? line.itemId.slice(0, 8);
              const itemName = line.item?.name ?? line.itemName ?? "—";
              const unitLabel = line.item?.unit ?? line.unit ?? "—";
              // Each line has its own bin — read from the line's location, not
              // the header (lines can be issued from different warehouses).
              const storageId = line.location?.storageId;
              const storageName = storageId
                ? (storageNameById.get(storageId) ?? storageId.slice(0, 8))
                : "—";
              const binCode = line.location?.code ?? "—";
              return (
                <tr key={line.id} className="border-b">
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {itemCode}
                  </td>
                  <td className="border-r px-2 py-1">{itemName}</td>
                  <td className="border-r px-2 py-1">{storageName}</td>
                  <td className="border-r px-2 py-1 font-mono text-xs">
                    {binCode}
                  </td>
                  <td className="border-r px-2 py-1">{unitLabel}</td>
                  <td className="border-r px-2 py-1 text-right tabular-nums">
                    {Number(line.quantity)}
                  </td>
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
