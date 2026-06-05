import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cn,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { Eye, Pencil, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { PaginationControls } from "../../components/table/PaginationControls";
import { ConfirmActionModal } from "../../components/table/ConfirmActionModal";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import {
  DEFAULT_PAGINATION,
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
  type StorageOption,
} from "./stock-takes.types";

export function StockTakesPage() {
  const [records, setRecords] = useState<PaginatedResponse<StockTake> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationStateDto>(DEFAULT_PAGINATION);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** New-mode draft from CreateStockTakeDialog. While set, FormDialog opens in "new" mode. */
  const [newDraft, setNewDraft] = useState<StockTakeDraft | null>(null);
  /** Loaded stock-take being viewed/edited. */
  const [editing, setEditing] = useState<StockTake | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<StockTake | null>(null);
  const [confirmProcess, setConfirmProcess] = useState<StockTake | null>(null);
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
        fromDate: period.from,
        toDate: period.to,
      });
      const { data } = await apiClient.get<PaginatedResponse<StockTake>>(
        `/inventory/stock-takes?${params}`,
      );
      setRecords(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRecords({ data: [], total: 0, page: 1, pageSize: pagination.pageSize });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, period.from, period.to]);

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

  const selected = useMemo(
    () => records?.data.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  );

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

  /** Fetch a single stock-take (with full lines) when opening for view/edit. */
  const openForEdit = useCallback(async (id: string) => {
    try {
      const { data } = await apiClient.get<StockTake>(
        `/inventory/stock-takes/${id}`,
      );
      setEditing(data);
      setSelectedId(id); // sync bottom panel to the row we just opened
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  }, []);

  const handleProcess = async (st: StockTake) => {
    setActionLoading(st.id);
    try {
      const { data } = await apiClient.post<StockTake>(
        `/inventory/stock-takes/${st.id}/process`,
      );
      if (data.generatedReceiptId || data.generatedIssueId) {
        toast.success(
          "Đã xử lý phiếu kiểm kê — đã sinh phiếu nhập/xuất chênh lệch.",
        );
      } else {
        toast.info(
          "Đã xử lý phiếu kiểm kê — không có chênh lệch nên không sinh phiếu.",
        );
      }
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
    try {
      await apiClient.delete(`/inventory/stock-takes/${st.id}`);
      toast.success("Đã huỷ phiếu kiểm kê.");
      setConfirmCancel(null);
      if (selectedId === st.id) setSelectedId(null);
      if (editing?.id === st.id) setEditing(null);
      await loadRecords();
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
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && void openForEdit(selected.id),
    },
    {
      id: "process",
      label: "Xử lý",
      icon: Settings2,
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && setConfirmProcess(selected),
    },
    {
      id: "delete",
      label: "Xoá",
      icon: Trash2,
      variant: "danger",
      disabled: !selected || selected.status !== "DRAFT",
      onClick: () => selected && setConfirmCancel(selected),
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
      render: (r) => new Date(r.createdAt).toLocaleDateString("vi-VN"),
    },
    {
      key: "documentNumber",
      label: "Số phiếu KK",
      width: 160,
      render: (r) => (
        <button
          type="button"
          className="font-mono text-primary-blue transition-colors hover:text-primary-blue-hover hover:underline"
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
          ? storageNameById.get(r.storageId) ?? r.storageId.slice(0, 8)
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
      render: (r) =>
        r.status === "DRAFT" ? (
          <span className="flex items-center gap-2">
            <span>{STATUS_LABEL[r.status]}</span>
            <button
              type="button"
              className="font-medium text-emerald-600 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmProcess(r);
              }}
            >
              Xử lý
            </button>
          </span>
        ) : (
          <span
            className={cn(r.status === "POSTED" && "text-emerald-600")}
          >
            {STATUS_LABEL[r.status]}
          </span>
        ),
    },
  ];

  /** What the bottom panel shows: prefer the currently-open form over the list selection. */
  const panelStockTake = editing ?? selected;

  return (
    <>
      <DocumentListShell
        title={<InventoryPageTitle>Kiểm kê kho</InventoryPageTitle>}
        tabs={<InventoryTabBar activeId="stock-take" />}
        toolbar={<PageToolbar items={toolbarItems} className="rounded-none" />}
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
        detailPanel={<StockTakeDetailPanel stockTake={panelStockTake} />}
      >
        <BaseDataTable
          columns={columns}
          rows={records?.data ?? []}
          loading={loading}
          emptyLabel="Chưa có phiếu kiểm kê trong khoảng thời gian này."
          getRowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (r) => (
              <input
                type="checkbox"
                aria-label="Chọn dòng"
                checked={selectedId === r.id}
                onChange={() =>
                  setSelectedId(selectedId === r.id ? null : r.id)
                }
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

      {newDraft ? (
        <StockTakeFormDialog
          initialDraft={newDraft}
          storageName={newDraft.storageName}
          previewDocumentNumber={nextDocumentNumber}
          onClose={() => {
            setNewDraft(null);
            void loadRecords();
          }}
          onSaved={async () => {
            await loadRecords();
          }}
        />
      ) : editing ? (
        <StockTakeFormDialog
          initialStockTake={editing}
          storageName={
            editing.storageId
              ? storageNameById.get(editing.storageId) ?? undefined
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
            editing.status === "DRAFT"
              ? () => setConfirmCancel(editing)
              : undefined
          }
          onRequestProcess={(st) => {
            setEditing(null);
            setConfirmProcess(st);
          }}
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
    </>
  );
}
