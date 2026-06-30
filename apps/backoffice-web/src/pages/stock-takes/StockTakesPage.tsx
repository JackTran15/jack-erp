import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppModal,
  Button,
  cn,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import {
  Combine,
  Eye,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
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
import { useDocumentListSelection } from "../../components/document/useDocumentListSelection";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
  type PaginationStateDto,
} from "../../components/table/pagination.dto";
import {
  CreateStockTakeDialog,
  type StockTakeDraft,
} from "./CreateStockTakeDialog";
import { StockTakeDetailPanel } from "./StockTakeDetailPanel";
import { StockTakeFormDialog } from "./StockTakeFormDialog";
import {
  STATUS_LABEL,
  type PaginatedResponse,
  type StockTake,
  type StockTakeMergePreview,
  type StorageOption,
} from "./stock-takes.types";

export function StockTakesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PaginatedResponse<StockTake> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] =
    useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilter>
  >({});
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<StockTake | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  /** New-mode draft from CreateStockTakeDialog. While set, FormDialog opens in "new" mode. */
  const [newDraft, setNewDraft] = useState<StockTakeDraft | null>(null);
  /** Loaded stock-take being viewed/edited. */
  const [editing, setEditing] = useState<StockTake | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<StockTake | null>(null);
  const [confirmProcess, setConfirmProcess] = useState<StockTake | null>(null);
  const [processResult, setProcessResult] = useState<{
    stockTakeNumber: string;
    hasReceipt: boolean;
    hasIssue: boolean;
    receiptNumber?: string;
    issueNumber?: string;
  } | null>(null);
  const [storages, setStorages] = useState<StorageOption[]>([]);

  const loadStorages = useCallback(async () => {
    try {
      const { data } = await apiClient.get<PaginatedResponse<StorageOption>>(
        "/inventory/storages?page=1&pageSize=200",
      );
      setStorages(data.data);
    } catch {
      // best-effort
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const createdAt = columnFilters.createdAt?.value?.trim();
      params.set("fromDate", createdAt || period.from);
      params.set("toDate", createdAt || period.to);
      const documentNumber = columnFilters.documentNumber?.value?.trim();
      const storage = columnFilters.storage?.value?.trim();
      const purpose = columnFilters.purpose?.value?.trim();
      const status = columnFilters.status?.value?.trim();
      const mergeStatus = columnFilters.mergeStatus?.value?.trim();
      if (documentNumber) params.set("documentNumber", documentNumber);
      if (storage) params.set("storage", storage);
      if (purpose) params.set("purpose", purpose);
      if (status) params.set("status", status);
      if (mergeStatus) params.set("mergeStatus", mergeStatus);
      const { data } = await apiClient.get<PaginatedResponse<StockTake>>(
        `/inventory/stock-takes?${params}`,
      );
      setRecords(data);
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
  }, [
    columnFilters,
    pagination.page,
    pagination.pageSize,
    period.from,
    period.to,
  ]);

  useEffect(() => {
    void loadStorages();
  }, [loadStorages]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const storageNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of storages) m.set(s.id, s.name);
    return m;
  }, [storages]);

  const getStockTakeId = useCallback((stockTake: StockTake) => stockTake.id, []);
  const {
    selectedId,
    setSelectedId,
    activeRecord: selected,
  } = useDocumentListSelection({
    rows: records?.data ?? [],
    getRowId: getStockTakeId,
    onAutoSelect: (stockTake) => setSelectedIds([stockTake.id]),
  });
  const selectedRows = useMemo(
    () =>
      (records?.data ?? []).filter((record) => selectedIds.includes(record.id)),
    [records, selectedIds],
  );
  const canMerge =
    selectedRows.length >= 2 &&
    selectedRows.every(
      (record) =>
        record.status !== "CANCELLED" &&
        !record.mergedIntoId &&
        record.status === selectedRows[0]?.status &&
        record.storageId === selectedRows[0]?.storageId &&
        record.countByValue === selectedRows[0]?.countByValue,
    );
  const mergeEligibleIds = useMemo(
    () =>
      (records?.data ?? [])
        .filter(
          (record) => record.status !== "CANCELLED" && !record.mergedIntoId,
        )
        .map((record) => record.id),
    [records],
  );
  const allEligibleSelected =
    mergeEligibleIds.length > 0 &&
    mergeEligibleIds.every((id) => selectedIds.includes(id));

  /**
   * Preview the next "Số phiếu KK" based on the highest numeric suffix in the
   * current page. Display-only — the server is still the source of truth and
   * assigns the real number atomically when the form is saved.
   */
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
    return `KK${String(max + 1).padStart(6, "0")}`;
  }, [records]);

  const detailRequestId = useRef(0);

  /** Fetch a full stock-take so the bottom panel always has lines and members. */
  const selectStockTake = useCallback(
    async (id: string) => {
      setSelectedId(id);
      const requestId = ++detailRequestId.current;
      try {
        const { data } = await apiClient.get<StockTake>(
          `/inventory/stock-takes/${id}`,
        );
        if (requestId !== detailRequestId.current) return null;
        setSelectedDetail(data);
        return data;
      } catch (err) {
        if (requestId === detailRequestId.current) {
          toast.error(getUserFacingApiErrorMessage(err));
        }
        return null;
      }
    },
    [setSelectedId],
  );

  useEffect(() => {
    if (!selected || selectedDetail?.id === selected.id) return;
    void selectStockTake(selected.id);
  }, [selectStockTake, selected, selectedDetail?.id]);

  /** Fetch a single stock-take (with full lines) when opening for view/edit. */
  const openForEdit = useCallback(async (id: string) => {
    const data = await selectStockTake(id);
    if (data) {
      setEditing(data);
    }
  }, [selectStockTake]);

  useEffect(() => {
    const openDocumentId = (
      location.state as { openDocumentId?: string } | null
    )?.openDocumentId;
    if (!openDocumentId) return;
    void openForEdit(openDocumentId).finally(() => {
      navigate(location.pathname, { replace: true, state: null });
    });
  }, [location.pathname, location.state, navigate, openForEdit]);

  const openStockTakeReference = useCallback(
    async (id: string) => {
      setEditing(null);
      await openForEdit(id);
    },
    [openForEdit],
  );

  const handleProcess = async (st: StockTake) => {
    setActionLoading(st.id);
    try {
      const { data } = await apiClient.post<StockTake>(
        `/inventory/stock-takes/${st.id}/process`,
      );
      const [receiptNumber, issueNumber] = await Promise.all([
        data.generatedReceiptId
          ? apiClient
              .get<{ documentNumber?: string }>(
                `/goods-receipts/${data.generatedReceiptId}`,
              )
              .then((response) => response.data.documentNumber)
              .catch(() => undefined)
          : Promise.resolve(undefined),
        data.generatedIssueId
          ? apiClient
              .get<{ documentNumber?: string }>(
                `/inventory/goods-issues/${data.generatedIssueId}`,
              )
              .then((response) => response.data.documentNumber)
              .catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      setProcessResult({
        stockTakeNumber:
          data.documentNumber ?? st.documentNumber ?? st.id.slice(0, 8),
        hasReceipt: !!data.generatedReceiptId,
        hasIssue: !!data.generatedIssueId,
        receiptNumber,
        issueNumber,
      });
      setConfirmProcess(null);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (st: StockTake) => {
    setActionLoading(st.id);
    setConfirmCancel(null);
    try {
      await apiClient.delete(`/inventory/stock-takes/${st.id}`);
      toast.success("Đã huỷ phiếu kiểm kê.");
      if (selectedId === st.id) {
        setSelectedId(null);
        setSelectedDetail(null);
      }
      if (editing?.id === st.id) setEditing(null);
      await loadRecords();
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleMerge = async () => {
    setActionLoading("merge");
    try {
      const { data } = await apiClient.post<StockTakeMergePreview>(
        "/inventory/stock-takes/merge-preview",
        { sourceIds: selectedIds },
      );
      setNewDraft({
        storageId: data.storageId ?? "",
        storageName: data.storageId
          ? (storageNameById.get(data.storageId) ?? "")
          : "",
        plannedDate: data.plannedDate ?? period.to,
        countedAt: data.countedAt,
        purpose: data.purpose,
        conclusion: data.conclusion,
        countByValue: data.countByValue,
        mergeSourceIds: data.mergeSourceIds,
        lines: data.lines,
        members: data.members,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Toolbar ─────────────────────────────────────────────────────────────
  const toolbarItems: ToolbarItem[] = [
    {
      id: "create",
      label: "Thêm mới",
      icon: Plus,
      onClick: () => setCreateOpen(true),
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => selected && void openForEdit(selected.id),
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled:
        !selected || selected.status !== "DRAFT" || !!selected.mergedIntoId,
      onClick: () => selected && void openForEdit(selected.id),
    },
    {
      id: "process",
      label: "Xử lý",
      icon: Settings2,
      disabled:
        !selected || selected.status !== "DRAFT" || !!selected.mergedIntoId,
      onClick: () => selected && setConfirmProcess(selected),
    },
    {
      id: "delete",
      label: "Xoá",
      icon: Trash2,
      variant: "danger",
      disabled:
        !selected || selected.status !== "DRAFT" || !!selected.mergedIntoId,
      onClick: () => selected && setConfirmCancel(selected),
    },
    {
      id: "merge",
      label: "Gộp phiếu",
      icon: Combine,
      disabled: !canMerge || actionLoading === "merge",
      onClick: () => void handleMerge(),
    },
    { id: "sep", type: "separator" },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: () => void loadRecords(),
    },
  ];

  // ─── Columns ─────────────────────────────────────────────────────────────
  const columns: TableColumn<StockTake>[] = [
    {
      key: "createdAt",
      label: "Ngày",
      width: 130,
      filterKind: "date",
      render: (r) => new Date(r.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu KK",
      width: 160,
      render: (r) => (
        <button
          type="button"
          className="font-medium text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            void openForEdit(r.id);
          }}
        >
          {r.documentNumber ?? `#${r.id.slice(0, 8)}`}
        </button>
      ),
    },
    {
      key: "storage",
      label: "Kho kiểm kê",
      width: 220,
      render: (r) =>
        r.storageId
          ? (storageNameById.get(r.storageId) ?? r.storageId.slice(0, 8))
          : "—",
    },
    {
      key: "purpose",
      label: "Diễn giải",
      render: (r) => r.purpose ?? r.conclusion ?? r.notes ?? "",
    },
    {
      key: "status",
      label: "Trạng thái",
      width: 180,
      filterKind: "select",
      filterOptions: [
        { value: "DRAFT", label: "Chưa xử lý" },
        { value: "POSTED", label: "Đã xử lý" },
        { value: "CANCELLED", label: "Đã huỷ" },
      ],
      filterPlaceholder: "Tất cả",
      render: (r) => {
        const noVariance =
          r.status === "POSTED" &&
          !r.generatedReceiptId &&
          !r.generatedIssueId;
        const label = r.mergedIntoId
          ? "Đã gộp"
          : noVariance
            ? "Không có chênh lệch"
            : STATUS_LABEL[r.status];
        return (
          <span
            className={cn(
              r.status === "POSTED" && !noVariance && "text-emerald-600",
              r.mergedIntoId && "text-primary",
            )}
          >
            {label}
          </span>
        );
      },
    },
    {
      key: "mergeStatus",
      label: "Gộp",
      width: 140,
      filterKind: "select",
      filterOptions: [
        { value: "UNMERGED", label: "Chưa gộp" },
        { value: "MERGED", label: "Đã gộp" },
      ],
      filterPlaceholder: "Tất cả",
      render: (r) => (r.mergedIntoId ? "Đã gộp" : "Chưa gộp"),
    },
  ];

  const setColumnFilterMode = useCallback(
    (fieldKey: string, mode: ColumnFilterMode) => {
      setColumnFilters((prev) => ({
        ...prev,
        [fieldKey]: {
          mode,
          value: prev[fieldKey]?.value ?? "",
        },
      }));
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [],
  );

  const setColumnFilterValue = useCallback(
    (fieldKey: string, value: string) => {
      setColumnFilters((prev) => ({
        ...prev,
        [fieldKey]: {
          mode: prev[fieldKey]?.mode ?? DEFAULT_COLUMN_FILTER_MODE,
          value,
        },
      }));
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    [],
  );

  /** What the bottom panel shows: prefer full records with lines and members. */
  const panelStockTake =
    editing ??
    (selected
      ? selectedDetail?.id === selectedId
        ? selectedDetail
        : selected
      : null);

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Kiểm kê kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="stock-take" />}
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
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
            onRefresh={() => void loadRecords()}
          />
        }
        detailPanel={<StockTakeDetailPanel stockTake={panelStockTake} />}
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu kiểm kê trong khoảng thời gian này."
          getRowKey={(r) => r.id}
          onRowClick={(r) => void selectStockTake(r.id)}
          columnFilterControl={{
            filters: columnFilters,
            onModeChange: setColumnFilterMode,
            onValueChange: setColumnFilterValue,
          }}
          leadingColumn={{
            width: 36,
            header: (
              <input
                type="checkbox"
                aria-label="Chọn tất cả phiếu có thể gộp"
                checked={allEligibleSelected}
                onChange={() =>
                  setSelectedIds((current) =>
                    allEligibleSelected
                      ? current.filter((id) => !mergeEligibleIds.includes(id))
                      : [...new Set([...current, ...mergeEligibleIds])],
                  )
                }
              />
            ),
            cell: (r) => (
              <input
                type="checkbox"
                aria-label="Chọn dòng"
                checked={selectedIds.includes(r.id)}
                onChange={() => {
                  void selectStockTake(r.id);
                  setSelectedIds((current) =>
                    current.includes(r.id)
                      ? current.filter((id) => id !== r.id)
                      : [...current, r.id],
                  );
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      {createOpen ? (
        <CreateStockTakeDialog
          onClose={() => setCreateOpen(false)}
          onPicked={(draft) => {
            setCreateOpen(false);
            setNewDraft(draft); // opens form in "new" mode — NO API call yet
          }}
        />
      ) : null}

      {newDraft && !editing ? (
        <StockTakeFormDialog
          initialDraft={newDraft}
          storageName={newDraft.storageName}
          previewDocumentNumber={nextDocumentNumber}
          onClose={() => {
            setNewDraft(null);
            void loadRecords();
          }}
          onSaved={async () => {
            setSelectedIds([]);
            await loadRecords();
          }}
          onOpenStockTakeReference={(id) =>
            void openStockTakeReference(id)
          }
        />
      ) : editing ? (
        <StockTakeFormDialog
          initialStockTake={editing}
          storageName={
            editing.storageId
              ? (storageNameById.get(editing.storageId) ?? undefined)
              : undefined
          }
          onClose={() => {
            setEditing(null);
            void loadRecords();
          }}
          onSaved={async () => {
            await loadRecords();
          }}
          onRequestDelete={
            editing.status === "DRAFT" && !editing.mergedIntoId
              ? () => setConfirmCancel(editing)
              : undefined
          }
          onRequestProcess={
            editing.mergedIntoId
              ? undefined
              : (st) => {
                  setEditing(null);
                  setConfirmProcess(st);
              }
          }
          onOpenStockTakeReference={(id) =>
            void openStockTakeReference(id)
          }
        />
      ) : null}

      {confirmCancel ? (
        <ConfirmActionModal
          title="Huỷ phiếu kiểm kê"
          message="Xác nhận huỷ phiếu kiểm kê này? Các giá trị đã đếm sẽ bị bỏ."
          confirmLabel="Huỷ phiếu"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmCancel.id}
          onCancel={() => setConfirmCancel(null)}
          onConfirm={() => void handleCancel(confirmCancel)}
        />
      ) : null}

      {confirmProcess ? (
        <ConfirmActionModal
          title="Xử lý phiếu kiểm kê"
          message={`Phiếu ${confirmProcess.documentNumber ?? confirmProcess.id.slice(0, 8)} sẽ được duyệt, phần mềm tự sinh phiếu nhập/xuất kho cho hàng chênh lệch và cập nhật tồn ngay. Tiếp tục?`}
          confirmLabel="Xử lý"
          cancelLabel="Quay lại"
          loading={actionLoading === confirmProcess.id}
          onCancel={() => setConfirmProcess(null)}
          onConfirm={() => void handleProcess(confirmProcess)}
        />
      ) : null}

      {processResult ? (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) setProcessResult(null);
          }}
          title="Thông báo"
          defaultWidth={420}
          defaultHeight={210}
          minWidth={360}
          minHeight={190}
          showFooter={false}
          preventOutsideClose
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-1 items-start gap-3 border-b px-1 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
                <Info className="h-6 w-6" />
              </span>
              <div className="space-y-1 pt-1 text-sm leading-5 text-foreground">
                {processResult.hasReceipt ? (
                  <p>
                    Đã sinh thành công phiếu nhập{" "}
                    {processResult.receiptNumber ? (
                      <strong>{processResult.receiptNumber}</strong>
                    ) : (
                      "kho"
                    )}{" "}
                    xử lý chênh lệch theo Phiếu kiểm kê{" "}
                    <strong>{processResult.stockTakeNumber}</strong>.
                  </p>
                ) : null}
                {processResult.hasIssue ? (
                  <p>
                    Đã sinh thành công phiếu xuất{" "}
                    {processResult.issueNumber ? (
                      <strong>{processResult.issueNumber}</strong>
                    ) : (
                      "kho"
                    )}{" "}
                    xử lý chênh lệch theo Phiếu kiểm kê{" "}
                    <strong>{processResult.stockTakeNumber}</strong>.
                  </p>
                ) : null}
                {!processResult.hasReceipt && !processResult.hasIssue ? (
                  <p>
                    Phiếu kiểm kê{" "}
                    <strong>{processResult.stockTakeNumber}</strong> không có
                    chênh lệch cần xử lý.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 justify-end py-2">
              <Button type="button" onClick={() => setProcessResult(null)}>
                Đồng ý
              </Button>
            </div>
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
