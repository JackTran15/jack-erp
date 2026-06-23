import {
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { Eye, Pencil, Plus, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TreasuryCashTabIdEnum,
  TreasuryTabBar,
} from "../../../../components/document/treasuryTabs";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { useDebouncedValue } from "../../../../lib/use-debounced-value";
import { useCashAccounts } from "../../../../hooks/treasury/use-cash-accounts";
import {
  loadCashCountParticipants,
  saveCashCountParticipants,
  useCashCount,
  useCashCountSearch,
  useCashCountMutations,
  type CashCountSearchBody,
} from "../../../../hooks/treasury/use-cash-counts";
import {
  columnToDateRangeFilter,
  columnToStringFilter,
  intersectDateRanges,
} from "../../../../hooks/treasury/treasury-search-filters";
import { CashCountDetailPanel } from "./CashCountDetailPanel";
import { CashCountFormDialog } from "./CashCountFormDialog";
import { CreateCashCountDialog } from "./CreateCashCountDialog";
import { useCashAccountDetail } from "../../../../hooks/treasury/use-cash-accounts";
import {
  cashCountToRecord,
  recordToCreateCashCountBody,
} from "./cash-count.api-adapter";
import {
  CASH_COUNT_FILTER_KEYS,
  CASH_COUNT_STATUS_LABEL,
  type CashCountFilterKey,
} from "./cash-count.constants";
import {
  CashCountDialogModeEnum,
  CashCountStatusEnum,
  type CashCountRecord,
} from "./cash-count.types";
import { CashCountStatus } from "../../cash-vouchers.types";
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

const CASH_COUNT_API_STATUS_BY_LABEL: Record<string, CashCountStatus> = {
  [CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.UNPROCESSED]]:
    CashCountStatus.DRAFT,
  [CASH_COUNT_STATUS_LABEL[CashCountStatusEnum.PROCESSED]]:
    CashCountStatus.POSTED,
};

function resolveCashCountSearchBody(
  filters: Record<CashCountFilterKey, ColumnFilter>,
  period: { from?: string; to?: string },
  pagination: { page: number; pageSize: number },
  cashAccountId: string,
): CashCountSearchBody {
  const status = CASH_COUNT_API_STATUS_BY_LABEL[filters.statusLabel.value];
  return {
    page: pagination.page,
    limit: pagination.pageSize,
    cashAccountId: cashAccountId || undefined,
    countedAt: intersectDateRanges(
      period,
      columnToDateRangeFilter(filters.countDate),
      columnToDateRangeFilter(filters.inventoryUntilDate),
    ),
    documentNumber: columnToStringFilter(filters.documentNumber),
    purpose: columnToStringFilter(filters.purpose),
    status: status ? { value: status } : undefined,
  };
}

export function TreasuryCashCountPage() {
  const { data: cashAccounts } = useCashAccounts();
  const cashAccountId = cashAccounts?.[0]?.id ?? "";
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

  const debouncedColumnFilters = useDebouncedValue(columnFilters, 300);
  const searchBody = useMemo(
    () =>
      resolveCashCountSearchBody(
        debouncedColumnFilters,
        appliedPeriod,
        pagination,
        cashAccountId,
      ),
    [debouncedColumnFilters, appliedPeriod, pagination, cashAccountId],
  );

  const {
    data: listData,
    isLoading,
    refetch,
  } = useCashCountSearch(searchBody, Boolean(cashAccountId));

  const records = useMemo(
    () => (listData?.data ?? []).map(cashCountToRecord),
    [listData?.data],
  );

  const { data: detailCount } = useCashCount(selectedId ?? undefined);

  const formCountId =
    formOpen &&
    formRecord?.id &&
    formMode !== CashCountDialogModeEnum.CREATE
      ? formRecord.id
      : undefined;

  const { data: formDetailCount, isLoading: isFormDetailLoading } =
    useCashCount(formCountId);

  const formInitial = useMemo((): CashCountRecord | null => {
    if (!formRecord) return null;
    const participants =
      formRecord.participants.length > 0
        ? formRecord.participants
        : loadCashCountParticipants(formRecord.id);
    if (formDetailCount) {
      return { ...cashCountToRecord(formDetailCount), participants };
    }
    return { ...formRecord, participants };
  }, [formRecord, formDetailCount]);

  const selected = useMemo(() => {
    if (formRecord) return formRecord;
    if (!selectedId) return null;
    const fromList = records.find((r) => r.id === selectedId);
    if (fromList) {
      return {
        ...fromList,
        participants: loadCashCountParticipants(selectedId),
      };
    }
    if (detailCount) {
      return {
        ...cashCountToRecord(detailCount),
        participants: loadCashCountParticipants(selectedId),
      };
    }
    return null;
  }, [formRecord, selectedId, records, detailCount]);

  const needsLiveAccountBalance =
    formOpen &&
    formMode !== CashCountDialogModeEnum.VIEW &&
    (formMode === CashCountDialogModeEnum.CREATE ||
      formRecord?.status !== CashCountStatusEnum.PROCESSED);

  const { data: cashAccountDetail, isLoading: isAccountBalanceLoading } =
    useCashAccountDetail(cashAccountId || undefined, needsLiveAccountBalance);

  const accountBalance = Number(cashAccountDetail?.balance ?? 0);

  const mutations = useCashCountMutations();

  const total = listData?.total ?? 0;

  const openForm = useCallback(
    (
      record: CashCountRecord | null,
      mode: CashCountDialogModeEnum,
      inventoryUntilDate?: string | null,
    ) => {
      if (record) {
        setFormRecord({
          ...record,
          participants: loadCashCountParticipants(record.id),
        });
      } else {
        setFormRecord(null);
      }
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
      onModeChange: (key: string, mode: ColumnFilterMode) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as CashCountFilterKey]: {
            ...prev[key as CashCountFilterKey],
            mode,
          },
        }));
        setPagination((prev) => ({ ...prev, page: 1 }));
      },
      onValueChange: (key: string, value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as CashCountFilterKey]: {
            ...prev[key as CashCountFilterKey],
            value,
          },
        }));
        setPagination((prev) => ({ ...prev, page: 1 }));
      },
      onRangeChange: (key: string, part: "from" | "to", value: string) => {
        setColumnFilters((prev) => ({
          ...prev,
          [key as CashCountFilterKey]: {
            ...prev[key as CashCountFilterKey],
            [part]: value,
          },
        }));
        setPagination((prev) => ({ ...prev, page: 1 }));
      },
    }),
    [columnFilters],
  );

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    refetch();
    toast.success("Đã nạp dữ liệu.");
  }, [period, refetch]);

  const handleReload = useCallback(() => {
    refetch();
    setSelectedId(null);
    closeForm();
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu.");
  }, [refetch, closeForm]);

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
      tooltip:
        selected?.status === CashCountStatusEnum.PROCESSED
          ? "Phiếu đã xử lý chỉ xem"
          : undefined,
      onClick: () => {
        if (selected) openForm(selected, CashCountDialogModeEnum.EDIT);
      },
    },
    { id: "sep2", type: "separator" },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: handleReload,
    },
  ];

  const handleSaveFromForm = useCallback(
    async (payload: CashCountRecord) => {
      if (!cashAccountId) {
        toast.error("Chưa có két tiền mặt.");
        return;
      }
      const countedAt = `${payload.countDate}T${payload.countTime || "12:00"}:00.000Z`;
      try {
        if (formMode === CashCountDialogModeEnum.CREATE) {
          const body = recordToCreateCashCountBody(
            payload,
            cashAccountId,
            countedAt,
          );
          const created = await mutations.create.mutateAsync(body);
          saveCashCountParticipants(created.id, payload.participants);
          setSelectedId(created.id);
        } else if (payload.id) {
          const {
            cashAccountId: _ca,
            documentNumber: _dn,
            ...updateBody
          } = recordToCreateCashCountBody(payload, cashAccountId, countedAt);
          await mutations.update.mutateAsync({
            id: payload.id,
            body: updateBody,
          });
          saveCashCountParticipants(payload.id, payload.participants);
        }
        toast.success("Đã lưu phiếu kiểm kê.");
        closeForm();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lưu thất bại.");
      }
    },
    [formMode, cashAccountId, mutations],
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
              className="flex items-center gap-1.5 rounded-none bg-primary-blue px-3 py-2 text-sm font-medium text-white hover:bg-primary-blue-hover"
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
          <div className="flex flex-wrap items-end gap-4">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              onApply={handleApply}
            />
          </div>
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
          rows={records}
          loading={isLoading}
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

      <CashCountFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          if (!o) closeForm();
        }}
        mode={formMode}
        initial={
          formMode === CashCountDialogModeEnum.CREATE ? null : formInitial
        }
        createDraft={
          createDraftDate ? { inventoryUntilDate: createDraftDate } : null
        }
        accountBalance={accountBalance}
        accountBalanceLoading={isAccountBalanceLoading}
        initialDetailLoading={isFormDetailLoading}
        onSaved={handleSaveFromForm}
        onProcess={async (id) => {
          try {
            const result = await mutations.post.mutateAsync(id);
            const record = cashCountToRecord(result);
            setFormRecord({
              ...record,
              participants: loadCashCountParticipants(id),
            });
            toast.success("Đã xử lý phiếu kiểm kê.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Xử lý thất bại.");
          }
        }}
        onDelete={(id) => {
          toast.info("Chức năng xóa chưa được hỗ trợ.");
        }}
        onRequestEdit={() => setFormMode(CashCountDialogModeEnum.EDIT)}
        onRequestCreate={() => {
          closeForm();
          setCreatePickerOpen(true);
        }}
      />
    </>
  );
}
