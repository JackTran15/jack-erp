import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  navigateToBarcodePrint,
  type BarcodePrefillItem,
} from "../../lib/barcode-print-navigation";
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
import { useRowMultiSelect } from "../../components/document/useRowMultiSelect";
import {
  RowSelectCheckbox,
  SelectAllCheckbox,
} from "../../components/document/RowSelectCheckbox";
import { mergeBarcodePrefillItems } from "../../lib/barcode-prefill-merge";
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
  GoodsIssueLine,
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
  // List rows carry a server-computed `totalAmount` (no `lines` to sum
  // client-side); full-detail fetches (GET /:id) still carry `lines`.
  if (o.totalAmount !== undefined) return o.totalAmount;
  return (o.lines ?? []).reduce((s, l) => s + lineSubtotal(l), 0);
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

/** GET /inventory/goods-issues/:id/lines response shape (paginated). */
interface GoodsIssueLinesPage {
  items: GoodsIssueLine[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
}

const LINES_PAGE_SIZE = 50;

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function GoodsIssuePage() {
  const location = useLocation();
  const navigate = useNavigate();
  // `totalAmount` is the server's SUM over every matching row, not only this
  // page — it backs the footer total.
  const [records, setRecords] = useState<
    (PaginatedResponse<GoodsIssue> & { totals: { totalAmount: number } }) | null
  >(null);
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
        totals: { totalAmount: number };
      }>("/v2/inventory/goods-issues/search", body);
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
  const { selectedId, setSelectedId } = useDocumentListSelection({
    rows: records?.data ?? [],
    getRowId: getIssueId,
  });

  // Tập phiếu đã tick — tách hẳn khỏi `selectedId`, nên tick không kéo theo
  // `GET /inventory/goods-issues/:id` và `/:id/lines` như trước.
  const {
    checkedIds,
    checkedCount,
    isChecked,
    toggle: toggleChecked,
    toggleAllOnPage,
    clear: clearChecked,
    allOnPageChecked,
    someOnPageChecked,
  } = useRowMultiSelect({ rows: records?.data ?? [], getRowId: getIssueId });

  // Cố ý chỉ phụ thuộc bộ lọc, KHÔNG phụ thuộc `pagination`: lật trang phải giữ tick
  // để gom phiếu qua nhiều trang rồi in tem một lượt.
  useEffect(() => {
    clearChecked();
  }, [columnFilters, period, clearChecked]);

  // List rows no longer carry `lines` (v2 search trims them, see
  // search-goods-issues-v2.handler.ts). The selected document's full detail
  // (header + lines) is fetched separately via the unchanged GET /:id, so the
  // barcode toolbar, the duplicate/view/edit dialog, and DetailPanel all read
  // from this instead of the stale list row.
  const { data: selectedIssueData } = useQuery({
    queryKey: ["goods-issue", selectedId],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<GoodsIssue>("/inventory/goods-issues/{id}", {
          params: { path: { id: selectedId! } },
        }),
      ),
    enabled: !!selectedId,
  });
  const selectedIssue = selectedIssueData ?? null;

  // Bật trong lúc gom lines của các phiếu đã tick, để nút "In tem mã" không bấm
  // được hai lần khi mạng chậm.
  const [gatheringLabels, setGatheringLabels] = useState(false);

  const toPrefillItems = useCallback(
    (lines: GoodsIssueLine[]): BarcodePrefillItem[] =>
      lines.map((line) => {
        const storageId = line.location?.storageId ?? "";
        return {
          itemId: line.itemId,
          sku: line.item?.code ?? line.itemCode ?? "",
          name: line.item?.name ?? line.itemName ?? "",
          unit: line.item?.unit ?? line.unit ?? "",
          // Lấy từ quan hệ `item` eager-loaded. Để 0 ở đây là đẩy việc tra giá
          // sang trang In tem mã, nơi nó tra từng SKU một — với một lượt in
          // hàng loạt thì thành hàng nghìn request.
          sellingPrice: Number(line.item?.sellingPrice) || 0,
          quantity: Number(line.quantity) || 0,
          storageId,
          storageName: storageId ? (storageNameById.get(storageId) ?? "") : "",
          locationId: line.locationId ?? line.location?.id ?? "",
          locationCode: line.location?.code ?? "",
        };
      }),
    [storageNameById],
  );

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

  // Frozen once the receiving branch confirms import: editing would cascade
  // into their already-posted phiếu nhập, and deleting was already refused.
  const receivedByDestination = selectedIssue?.transferImported === true;

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
      // Allow editing any non-cancelled row. BE update() handles POSTED by
      // writing the difference as a stock-ledger adjustment instead of
      // overwriting what was already posted — except once the destination
      // branch has received the transfer, when that adjustment would rewrite
      // their posted phiếu nhập and the BE refuses outright.
      tooltip: receivedByDestination
        ? "Chi nhánh nhận đã nhập phiếu này nên không sửa được nữa."
        : undefined,
      disabled:
        !selectedIssue ||
        selectedIssue.status === "CANCELLED" ||
        receivedByDestination,
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
      // reversing the stock movements before marking the doc cancelled. The
      // received-transfer lock has always applied here on the server side.
      tooltip: receivedByDestination
        ? "Chi nhánh nhận đã nhập phiếu này, phải xoá phiếu nhập trước."
        : undefined,
      disabled:
        !selectedIssue ||
        selectedIssue.status === "CANCELLED" ||
        receivedByDestination,
      onClick: () => selectedIssue && setConfirmDelete(selectedIssue),
    },
    { id: "sep1", type: "separator" },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => {
        clearChecked();
        void loadRecords();
      },
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
      disabled: gatheringLabels,
      onClick: () => {
        // Không tick phiếu nào → giữ nguyên đường cũ: in theo dòng đang xem.
        if (checkedCount === 0) {
          const items = toPrefillItems(selectedIssue?.lines ?? []);
          navigateToBarcodePrint(
            navigate,
            "/inventory/goods-issues",
            items.length ? items : undefined,
          );
          return;
        }
        // Có tick → gom lines của từng phiếu. Dùng `GET /:id` (trả lines đầy đủ)
        // chứ không phải `/:id/lines`, vốn phân trang cho panel cuộn vô hạn.
        setGatheringLabels(true);
        void (async () => {
          try {
            const issues = await Promise.all(
              [...checkedIds].map(async (id) =>
                requireErpData(
                  await erpApi.GET<GoodsIssue>(
                    "/inventory/goods-issues/{id}",
                    { params: { path: { id } } },
                  ),
                ),
              ),
            );
            const items = mergeBarcodePrefillItems(
              issues.flatMap((issue) => toPrefillItems(issue.lines ?? [])),
            );
            navigateToBarcodePrint(
              navigate,
              "/inventory/goods-issues",
              items.length ? items : undefined,
            );
          } catch (err) {
            // Một phiếu hỏng là hỏng cả lượt in: đứng yên tại chỗ, không điều hướng
            // sang trang In tem mã với dữ liệu thiếu.
            toast.error(getUserFacingApiErrorMessage(err));
          } finally {
            setGatheringLabels(false);
          }
        })();
      },
    },
  ];

  // ─── Master table columns ─────────────────────────────────────────────────────

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
            // Row no longer carries `lines` — fetch the full document before
            // opening the view dialog (mirrors the openDocumentId deep-link
            // fetch above).
            void (async () => {
              try {
                const { data } = await apiClient.get<GoodsIssue>(
                  `/inventory/goods-issues/${row.id}`,
                );
                setEditingIssue(data);
                setDialogMode("view");
              } catch (err) {
                toast.error(getUserFacingApiErrorMessage(err));
              }
            })();
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
      // Tổng của toàn tập kết quả lọc, do server tính — không phải tổng trang.
      footer:
        showTotalFooter && records
          ? formatMoneyInteger(records.totals.totalAmount)
          : undefined,
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
          rowClassName={(row) =>
            // `bg-info-subtle` là token của badge, lightness 98% — trên nền trắng của
            // bảng nó vô hình. Dòng đang xem cần nhìn thấy được, nên dùng `bg-info`
            // pha loãng.
            row.id === selectedId ? "bg-info/15" : undefined
          }
          leadingColumn={{
            width: 36,
            header: (
              <SelectAllCheckbox
                checked={allOnPageChecked}
                indeterminate={someOnPageChecked}
                disabled={(records?.data.length ?? 0) === 0}
                onToggle={toggleAllOnPage}
              />
            ),
            cell: (row) => (
              <RowSelectCheckbox
                checked={isChecked(row.id)}
                onToggle={() => toggleChecked(row.id)}
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
  const issueId = issue?.id ?? null;

  // Paginated, independent from the header (`issue`) query's cache key so a
  // header refetch doesn't discard already-scrolled line pages.
  const linesQuery = useInfiniteQuery({
    queryKey: ["goods-issue-lines", issueId],
    queryFn: async ({ pageParam }) =>
      requireErpData(
        await erpApi.GET<GoodsIssueLinesPage>("/inventory/goods-issues/{id}/lines", {
          params: {
            path: { id: issueId! },
            query: { page: pageParam, pageSize: LINES_PAGE_SIZE },
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: !!issueId,
  });

  const lines = useMemo(
    () => linesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [linesQuery.data],
  );

  const hasNextPage = linesQuery.hasNextPage;
  const isFetchingNextPage = linesQuery.isFetchingNextPage;
  const fetchNextPage = linesQuery.fetchNextPage;

  // Sentinel row, observed instead of a scroll listener: the actual scroll
  // container (DocumentListShell's resizable detail-panel wrapper) lives
  // outside this component, so we can't attach onScroll to it directly.
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lines.length]);

  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {!issue ? (
        <p className="text-sm text-muted-foreground">
          Chọn một phiếu để xem chi tiết.
        </p>
      ) : linesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      ) : lines.length === 0 ? (
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
            {lines.map((line) => {
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
            {hasNextPage && (
              <tr ref={sentinelRef}>
                <td colSpan={20} className="py-2 text-center text-xs text-muted-foreground">
                  {isFetchingNextPage ? "Đang tải thêm..." : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Form dialog (create / edit / view) ──────────────────────────────────────
