import { useCallback, useMemo, useState } from "react";
import {
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  TreasuryCashTabIdEnum,
  TreasuryTabBar,
} from "../../../../components/document/treasuryTabs";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../../../components/table/ConfirmActionModal";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  applyColumnFilter,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { CashCountDetailPanel } from "./CashCountDetailPanel";
import { CashCountFormDialog } from "./CashCountFormDialog";
import { CreateCashCountDialog } from "./CreateCashCountDialog";
import {
  CASH_COUNT_FILTER_KEYS,
  type CashCountFilterKey,
} from "./cash-count.constants";
import {
  CashCountDialogModeEnum,
  CashCountStatusEnum,
  type CashCountRecord,
} from "./cash-count.types";
import {
  filterCashCountByPeriod,
  nextKkqNumber,
  toComparableCashCountText,
} from "./cash-count.utils";
import { useCashCountMockStore } from "./useCashCountMockStore";
import { useCashCountTableColumns } from "./useCashCountTableColumns";

function emptyColumnFilters(): Record<CashCountFilterKey, ColumnFilter> {
  return CASH_COUNT_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<CashCountFilterKey, ColumnFilter>,
  );
}

export function TreasuryCashCountPage() {
  const mockStore = useCashCountMockStore();
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<CashCountFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createPickerOpen, setCreatePickerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<CashCountDialogModeEnum>(
    CashCountDialogModeEnum.VIEW,
  );
  const [formRecord, setFormRecord] = useState<CashCountRecord | null>(null);
  const [createDraftDate, setCreateDraftDate] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CashCountRecord | null>(
    null,
  );

  const periodRecords = useMemo(
    () =>
      filterCashCountByPeriod(
        mockStore.records,
        appliedPeriod.from,
        appliedPeriod.to,
      ),
    [mockStore.records, appliedPeriod],
  );

  const filteredRecords = useMemo(() => {
    return periodRecords.filter((record) =>
      CASH_COUNT_FILTER_KEYS.every((key) =>
        applyColumnFilter(
          toComparableCashCountText(record, key),
          columnFilters[key],
        ),
      ),
    );
  }, [periodRecords, columnFilters]);

  const total = filteredRecords.length;
  const pagedRecords = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredRecords.slice(start, start + pagination.pageSize);
  }, [filteredRecords, pagination]);

  const selected = mockStore.getById(selectedId);
  const previewKkq = useMemo(
    () => nextKkqNumber(mockStore.records),
    [mockStore.records],
  );

  const openForm = useCallback(
    (
      record: CashCountRecord | null,
      mode: CashCountDialogModeEnum,
      inventoryUntilDate?: string | null,
    ) => {
      setFormRecord(record);
      setFormMode(mode);
      setCreateDraftDate(
        mode === CashCountDialogModeEnum.CREATE
          ? (inventoryUntilDate ?? null)
          : null,
      );
      setFormOpen(true);
      if (record) setSelectedId(record.id);
    },
    [],
  );

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setFormRecord(null);
    setCreateDraftDate(null);
  }, []);

  const columns = useCashCountTableColumns((record) => {
    setSelectedId(record.id);
    openForm(record, CashCountDialogModeEnum.VIEW);
  });

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as CashCountFilterKey]: {
            ...prev[key as CashCountFilterKey],
            mode,
          },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as CashCountFilterKey]: {
            ...prev[key as CashCountFilterKey],
            value,
          },
        })),
    }),
    [columnFilters],
  );

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp dữ liệu.");
  }, [period]);

  const handleReload = useCallback(() => {
    mockStore.reloadFromSeed();
    setSelectedId(null);
    closeForm();
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu mẫu.");
  }, [mockStore, closeForm]);

  const canMutateSelected =
    !!selected && selected.status === CashCountStatusEnum.UNPROCESSED;

  const toolbarItems: ToolbarItem[] = [
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selected,
      onClick: () => {
        if (selected) openForm(selected, CashCountDialogModeEnum.VIEW);
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !canMutateSelected,
      tooltip: selected?.status === CashCountStatusEnum.PROCESSED
        ? "Phiếu đã xử lý chỉ xem"
        : undefined,
      onClick: () => {
        if (selected) openForm(selected, CashCountDialogModeEnum.EDIT);
      },
    },
    {
      id: "sep1",
      type: "separator",
    },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !canMutateSelected,
      onClick: () => {
        if (selected) setConfirmDelete(selected);
      },
    },
    {
      id: "sep2",
      type: "separator",
    },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: handleReload,
    },
  ];

  const handleSaveFromForm = useCallback(
    (payload: CashCountRecord) => {
      if (formMode === CashCountDialogModeEnum.CREATE) {
        const draft = mockStore.createDraftRecord(
          payload.inventoryUntilDate || createDraftDate || "",
        );
        const created = mockStore.addRecord({
          ...draft,
          ...payload,
          inventoryUntilDate:
            payload.inventoryUntilDate || createDraftDate || draft.inventoryUntilDate,
        });
        setSelectedId(created.id);
        setFormRecord(created);
        setFormMode(CashCountDialogModeEnum.EDIT);
      } else if (payload.id) {
        mockStore.updateRecord(payload.id, payload);
        setFormRecord(mockStore.getById(payload.id));
      }
    },
    [formMode, mockStore, createDraftDate],
  );

  return (
    <>
      <DocumentListShell
        title="Tiền mặt"
        tabs={<TreasuryTabBar activeId={TreasuryCashTabIdEnum.COUNT} />}
        toolbar={
          <div className="flex items-stretch">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-none bg-[#1f2d8a] px-3 py-2 text-sm font-medium text-white hover:bg-[#1a266f]"
              onClick={() => setCreatePickerOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm mới
            </button>
            <PageToolbar
              items={toolbarItems}
              tone="primary"
              className="flex-1 rounded-none border-0"
            />
          </div>
        }
        filters={
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={handleApply}
          />
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={total}
            onPageChange={(p) =>
              setPagination((prev) => ({ ...prev, page: p }))
            }
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
          />
        }
        detailPanel={<CashCountDetailPanel record={selected} />}
      >
        <BaseDataTable
          columns={columns}
          rows={pagedRecords}
          loading={false}
          emptyLabel="Không có phiếu kiểm kê trong kỳ đã chọn."
          getRowKey={(r) => r.id}
          onRowClick={(r) => setSelectedId(r.id)}
          columnFilterControl={columnFilterControl}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn ${row.documentNumber}`}
                checked={selectedId === row.id}
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      {createPickerOpen ? (
        <CreateCashCountDialog
          onClose={() => setCreatePickerOpen(false)}
          onPicked={(date) => {
            setCreatePickerOpen(false);
            openForm(null, CashCountDialogModeEnum.CREATE, date);
          }}
        />
      ) : null}

      {formOpen ? (
        <CashCountFormDialog
          mode={formMode}
          initial={formMode === CashCountDialogModeEnum.CREATE ? null : formRecord}
          createDraft={
            createDraftDate ? { inventoryUntilDate: createDraftDate } : null
          }
          previewDocumentNumber={previewKkq}
          allRecords={mockStore.records}
          onClose={closeForm}
          onSaved={handleSaveFromForm}
          onProcess={(id) => {
            mockStore.processRecord(id);
            const updated = mockStore.getById(id);
            if (updated) setFormRecord(updated);
          }}
          onDelete={(id) => {
            mockStore.removeRecord(id);
            if (selectedId === id) setSelectedId(null);
            closeForm();
            toast.success("Đã xóa phiếu kiểm kê.");
          }}
          onRequestEdit={() => setFormMode(CashCountDialogModeEnum.EDIT)}
          onRequestCreate={() => {
            closeForm();
            setCreatePickerOpen(true);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmActionModal
          title="Xóa phiếu kiểm kê"
          message={`Xác nhận xóa ${confirmDelete.documentNumber}?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            mockStore.removeRecord(confirmDelete.id);
            if (selectedId === confirmDelete.id) setSelectedId(null);
            if (formRecord?.id === confirmDelete.id) closeForm();
            setConfirmDelete(null);
            toast.success("Đã xóa phiếu kiểm kê.");
          }}
        />
      ) : null}
    </>
  );
}
