import {
  AppModal,
  Button,
  DocumentListShell,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageToolbar,
  PeriodFilter,
  SingleSelect,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
  type SingleSelectOption,
  type ToolbarItem,
} from "@erp/ui";
import {
  ArrowLeftRight,
  ChevronDown,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DepositTabBar,
  DepositTabIdEnum,
} from "../../../../components/document/depositTabs";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import { ConfirmActionModal } from "../../../../components/table/ConfirmActionModal";
import { PaginationControls } from "../../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  applyColumnFilter,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { useDepositAccounts } from "../../../../hooks/treasury/use-deposit-accounts";
import { useCategoryNameMap } from "../../../../hooks/treasury/use-cash-voucher-categories";
import {
  useBankPayment,
  useBankPaymentMutations,
  useBankPaymentsList,
} from "../../../../hooks/treasury/use-bank-payments";
import {
  useBankReceipt,
  useBankReceiptMutations,
  useBankReceiptsList,
} from "../../../../hooks/treasury/use-bank-receipts";
import { useSupplierDepositPaymentMutation } from "../../../../hooks/treasury/use-supplier-deposit-payment";
import { useFundSwapMutation } from "../../../../hooks/treasury/use-fund-swap";
import { useCreateDepositTransfer } from "../../../../hooks/treasury/use-deposit-transfers";
import { CashVoucherCategoryDirection } from "../../cash-vouchers.types";
import {
  DepositPaymentVoucherDialog,
  DepositReceiptVoucherDialog,
  FundSwapDialog,
  TreasuryVoucherDialogModeEnum,
  type DepositPaymentSaveResult,
} from "../../documents";
import {
  BankVoucherStatus,
  type BankVoucherLine,
  type CreateBankPaymentBody,
  type CreateBankReceiptBody,
} from "../../bank-vouchers.types";
import { ReceiptDepositDetailPanel } from "./ReceiptDepositDetailPanel";
import {
  RECEIPT_DEPOSIT_FILTER_KEYS,
  type ReceiptDepositFilterKey,
} from "./receipt-deposit.constants";
import {
  ReceiptDepositKind,
  ReceiptDepositVoucherDialogKindEnum,
  type ReceiptDepositListItem,
  type ReceiptDepositVoucherDialogState,
} from "./receipt-deposit.types";
import { mergeReceiptDepositLists } from "./receipt-deposit.utils";
import { useReceiptDepositTableColumns } from "./useReceiptDepositTableColumns";

function emptyColumnFilters(): Record<ReceiptDepositFilterKey, ColumnFilter> {
  return RECEIPT_DEPOSIT_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<ReceiptDepositFilterKey, ColumnFilter>,
  );
}

function dialogKindFromItem(item: ReceiptDepositListItem): ReceiptDepositVoucherDialogKindEnum {
  return item.kind === ReceiptDepositKind.RECEIPT
    ? ReceiptDepositVoucherDialogKindEnum.RECEIPT
    : ReceiptDepositVoucherDialogKindEnum.PAYMENT;
}

export function TreasuryDepositReceiptsPage() {
  const { data: accounts = [] } = useDepositAccounts();
  // "" = Tất cả quỹ của chi nhánh (mặc định) — BE bỏ qua filter khi param vắng mặt.
  const [depositAccountId, setDepositAccountIdState] = useState("");
  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<ReceiptDepositFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voucherDialog, setVoucherDialog] =
    useState<ReceiptDepositVoucherDialogState | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<ReceiptDepositListItem | null>(null);
  const [reverseItem, setReverseItem] = useState<ReceiptDepositListItem | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseLoading, setReverseLoading] = useState(false);
  const [fundSwapOpen, setFundSwapOpen] = useState(false);

  const categoryInMap = useCategoryNameMap(CashVoucherCategoryDirection.IN);
  const categoryOutMap = useCategoryNameMap(CashVoucherCategoryDirection.OUT);

  const listQuery = useMemo(
    () => ({
      depositAccountId: depositAccountId || undefined,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
      page: 1,
      pageSize: 100,
    }),
    [depositAccountId, appliedPeriod],
  );

  const receiptsList = useBankReceiptsList(listQuery, true);
  const paymentsList = useBankPaymentsList(listQuery, true);
  const isLoading = receiptsList.isLoading || paymentsList.isLoading;

  const listRows = useMemo(
    () => mergeReceiptDepositLists(receiptsList.data?.data ?? [], paymentsList.data?.data ?? []),
    [receiptsList.data, paymentsList.data],
  );

  const selectedItem = useMemo(
    () => listRows.find((r) => r.id === selectedId) ?? null,
    [listRows, selectedId],
  );

  const { data: receiptDetail } = useBankReceipt(
    selectedItem?.kind === ReceiptDepositKind.RECEIPT ? (selectedId ?? undefined) : undefined,
  );
  const { data: paymentDetail } = useBankPayment(
    selectedItem?.kind === ReceiptDepositKind.PAYMENT ? (selectedId ?? undefined) : undefined,
  );

  const detailLines: BankVoucherLine[] = receiptDetail?.lines ?? paymentDetail?.lines ?? [];
  const detailCategoryNames =
    selectedItem?.kind === ReceiptDepositKind.PAYMENT ? categoryOutMap : categoryInMap;

  const filteredRows = useMemo(() => {
    return listRows.filter((row) => {
      const dateText = new Date(`${row.docDate}T12:00:00`).toLocaleDateString("vi-VN");
      const typeLabel =
        row.kind === ReceiptDepositKind.RECEIPT ? "Phiếu thu tiền gửi" : "Phiếu chi tiền gửi";
      return (
        applyColumnFilter(toComparableText(dateText), columnFilters.documentDate) &&
        applyColumnFilter(toComparableText(row.documentNumber), columnFilters.voucherNo) &&
        applyColumnFilter(toComparableText(typeLabel), columnFilters.documentTypeLabel) &&
        applyColumnFilter(toComparableText(row.totalAmount), columnFilters.totalAmount) &&
        applyColumnFilter(toComparableText(row.counterparty), columnFilters.counterparty) &&
        applyColumnFilter(toComparableText(row.reason), columnFilters.reason)
      );
    });
  }, [listRows, columnFilters]);

  const total = filteredRows.length;
  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredRows.slice(start, start + pagination.pageSize);
  }, [filteredRows, pagination]);

  const receiptMutations = useBankReceiptMutations();
  const paymentMutations = useBankPaymentMutations();
  const supplierDepositPayment = useSupplierDepositPaymentMutation();
  const fundSwap = useFundSwapMutation();
  const createDepositTransfer = useCreateDepositTransfer();

  const closeVoucherDialogs = useCallback(() => setVoucherDialog(null), []);

  const openViewVoucher = useCallback((item: ReceiptDepositListItem) => {
    setSelectedId(item.id);
    setVoucherDialog({ kind: dialogKindFromItem(item), mode: TreasuryVoucherDialogModeEnum.VIEW });
  }, []);

  const openEditVoucher = useCallback((item: ReceiptDepositListItem) => {
    setSelectedId(item.id);
    setVoucherDialog({ kind: dialogKindFromItem(item), mode: TreasuryVoucherDialogModeEnum.EDIT });
  }, []);

  const columns = useReceiptDepositTableColumns(
    (row) => openViewVoucher(row),
    accountsById,
  );

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as ReceiptDepositFilterKey]: { ...prev[key as ReceiptDepositFilterKey], mode },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as ReceiptDepositFilterKey]: { ...prev[key as ReceiptDepositFilterKey], value },
        })),
    }),
    [columnFilters],
  );

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    void receiptsList.refetch();
    void paymentsList.refetch();
    toast.success("Đã nạp dữ liệu.");
  }, [period, receiptsList, paymentsList]);

  const handleReload = useCallback(() => {
    void receiptsList.refetch();
    void paymentsList.refetch();
    setSelectedId(null);
    closeVoucherDialogs();
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu.");
  }, [receiptsList, paymentsList, closeVoucherDialogs]);

  const canEditSelected = !!selectedItem && selectedItem.status === BankVoucherStatus.DRAFT;

  const handlePageEdit = useCallback(() => {
    if (!selectedItem) return;
    if (
      voucherDialog?.mode === TreasuryVoucherDialogModeEnum.VIEW &&
      voucherDialog.kind === dialogKindFromItem(selectedItem)
    ) {
      setVoucherDialog((prev) => (prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev));
      return;
    }
    openEditVoucher(selectedItem);
  }, [selectedItem, voucherDialog, openEditVoucher]);

  const accountOptions: SingleSelectOption[] = useMemo(
    () => [
      { value: "", label: "Tất cả" },
      ...accounts.map((a) => ({
        value: a.id,
        label: a.accountNo ? `${a.name} · ${a.accountNo}` : a.name,
      })),
    ],
    [accounts],
  );

  const toolbarItems: ToolbarItem[] = [
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selectedItem,
      onClick: () => {
        if (selectedItem) openViewVoucher(selectedItem);
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !canEditSelected,
      tooltip:
        selectedItem && selectedItem.status !== BankVoucherStatus.DRAFT ? "Chỉ sửa phiếu nháp" : undefined,
      onClick: handlePageEdit,
    },
    {
      id: "reverse",
      label: "Đảo",
      icon: RotateCcw,
      disabled: !selectedItem || selectedItem.status !== BankVoucherStatus.POSTED,
      tooltip:
        selectedItem && selectedItem.status !== BankVoucherStatus.POSTED
          ? "Chỉ đảo phiếu đã ghi sổ"
          : undefined,
      onClick: () => {
        if (selectedItem) {
          setReverseReason("");
          setReverseItem(selectedItem);
        }
      },
    },
    { id: "sep1", type: "separator" },
    {
      id: "delete",
      label: "Xóa",
      icon: Trash2,
      variant: "danger",
      disabled: !selectedItem || selectedItem.status !== BankVoucherStatus.DRAFT,
      onClick: () => {
        if (selectedItem) setConfirmDeleteItem(selectedItem);
      },
    },
    { id: "sep2", type: "separator" },
    {
      id: "swap",
      label: "Chuyển quỹ",
      icon: ArrowLeftRight,
      onClick: () => setFundSwapOpen(true),
    },
    {
      id: "reload",
      label: "Nạp",
      icon: RefreshCw,
      onClick: handleReload,
    },
  ];

  const listTotal = useMemo(() => filteredRows.reduce((s, r) => s + r.totalAmount, 0), [filteredRows]);

  const openCreateReceipt = useCallback(() => {
    setVoucherDialog({
      kind: ReceiptDepositVoucherDialogKindEnum.RECEIPT,
      mode: TreasuryVoucherDialogModeEnum.CREATE,
    });
  }, []);

  const openCreatePayment = useCallback(() => {
    setVoucherDialog({
      kind: ReceiptDepositVoucherDialogKindEnum.PAYMENT,
      mode: TreasuryVoucherDialogModeEnum.CREATE,
    });
  }, []);

  const handleSaveReceipt = useCallback(
    async (body: CreateBankReceiptBody) => {
      try {
        if (voucherDialog?.mode === TreasuryVoucherDialogModeEnum.CREATE) {
          const created = await receiptMutations.create.mutateAsync(body);
          setSelectedId(created.id);
        } else if (selectedId) {
          const { documentNumber: _doc, ...updateBody } = body;
          await receiptMutations.update.mutateAsync({ id: selectedId, body: updateBody });
        }
        closeVoucherDialogs();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lưu phiếu thu thất bại.");
      }
    },
    [voucherDialog, selectedId, receiptMutations, closeVoucherDialogs],
  );

  const handleSavePayment = useCallback(
    async (result: DepositPaymentSaveResult) => {
      try {
        if (result.kind === "supplierDepositPayment") {
          const saga = await supplierDepositPayment.mutateAsync(result.body);
          if (saga.bankPaymentId) setSelectedId(saga.bankPaymentId);
        } else if (result.kind === "fundSwap") {
          // useFundSwapMutation already invalidates the bank-payments/bank-receipts
          // query keys this page's lists read from — no manual refetch needed.
          await fundSwap.mutateAsync(result.body);
        } else if (result.kind === "depositTransfer") {
          // useCreateDepositTransfer only invalidates deposit-transfer/-dashboard/
          // -ledger keys, not bank-payments — the INTER_BRANCH_OUT leg it creates
          // needs an explicit refetch to show up in this page's list right away.
          await createDepositTransfer.mutateAsync(result.body);
          void receiptsList.refetch();
          void paymentsList.refetch();
        } else {
          const body: CreateBankPaymentBody = result.body;
          if (voucherDialog?.mode === TreasuryVoucherDialogModeEnum.CREATE) {
            const created = await paymentMutations.create.mutateAsync(body);
            setSelectedId(created.id);
          } else if (selectedId) {
            const { documentNumber: _doc, ...updateBody } = body;
            await paymentMutations.update.mutateAsync({ id: selectedId, body: updateBody });
          }
        }
        closeVoucherDialogs();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lưu phiếu chi thất bại.");
      }
    },
    [
      voucherDialog,
      selectedId,
      paymentMutations,
      supplierDepositPayment,
      fundSwap,
      createDepositTransfer,
      receiptsList,
      paymentsList,
      closeVoucherDialogs,
    ],
  );

  const handleConfirmReverse = useCallback(async () => {
    if (!reverseItem) return;
    const reason = reverseReason.trim();
    if (!reason) {
      toast.error("Nhập lý do đảo chứng từ.");
      return;
    }
    setReverseLoading(true);
    try {
      if (reverseItem.kind === ReceiptDepositKind.RECEIPT) {
        await receiptMutations.reverse.mutateAsync({ id: reverseItem.id, reason });
      } else {
        await paymentMutations.reverse.mutateAsync({ id: reverseItem.id, reason });
      }
      setReverseItem(null);
      setReverseReason("");
      toast.success("Đã đảo chứng từ.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đảo chứng từ thất bại.");
    } finally {
      setReverseLoading(false);
    }
  }, [reverseItem, reverseReason, receiptMutations, paymentMutations]);

  const dialogInitial =
    voucherDialog?.mode === TreasuryVoucherDialogModeEnum.CREATE
      ? null
      : (receiptDetail ?? null);
  const paymentDialogInitial =
    voucherDialog?.mode === TreasuryVoucherDialogModeEnum.CREATE
      ? null
      : (paymentDetail ?? null);

  return (
    <>
      <DocumentListShell
        title="Thu, chi tiền gửi"
        tabs={<DepositTabBar activeId={DepositTabIdEnum.RECEIPTS_EXPENSES} />}
        toolbar={
          <div className="flex items-stretch">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-none bg-primary-blue px-3 py-2 text-sm font-medium text-white hover:bg-primary-blue-hover"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm mới
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openCreateReceipt();
                  }}
                >
                  Phiếu thu tiền gửi
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openCreatePayment();
                  }}
                >
                  Phiếu chi tiền gửi
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PageToolbar items={toolbarItems} tone="primary" className="flex-1 rounded-none border-0" />
          </div>
        }
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Tài khoản tiền gửi</span>
              <SingleSelect
                options={accountOptions}
                value={depositAccountId}
                onValueChange={setDepositAccountIdState}
                placeholder="Chọn tài khoản"
                className="w-64"
              />
            </div>
            <PeriodFilter value={period} onChange={setPeriod} onApply={handleApply} />
          </div>
        }
        summary={
          <div className="flex items-center justify-end gap-6 px-2">
            <span className="text-muted-foreground">Tổng tiền:</span>
            <span className="text-base font-semibold">{formatMoneyInteger(listTotal)}</span>
          </div>
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={total}
            onPageChange={(p) => setPagination((prev) => ({ ...prev, page: p }))}
            onPageSizeChange={(s) => setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))}
          />
        }
        detailPanel={
          <ReceiptDepositDetailPanel lines={detailLines} categoryNames={detailCategoryNames} />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={pagedRows}
          loading={isLoading}
          emptyLabel="Không có chứng từ thu chi tiền gửi trong kỳ đã chọn."
          getRowKey={(row) => `${row.kind}-${row.id}`}
          onRowClick={(row) => setSelectedId(row.id)}
          columnFilterControl={columnFilterControl}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn ${row.documentNumber}`}
                checked={selectedId === row.id}
                onChange={() => setSelectedId(selectedId === row.id ? null : row.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      <DepositReceiptVoucherDialog
        open={!!voucherDialog && voucherDialog.kind === ReceiptDepositVoucherDialogKindEnum.RECEIPT}
        onOpenChange={(open) => {
          if (!open) closeVoucherDialogs();
        }}
        mode={voucherDialog?.mode ?? TreasuryVoucherDialogModeEnum.VIEW}
        initial={dialogInitial}
        onSave={(body) => void handleSaveReceipt(body)}
        onRequestEdit={() =>
          setVoucherDialog((prev) => (prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev))
        }
      />

      <DepositPaymentVoucherDialog
        open={!!voucherDialog && voucherDialog.kind === ReceiptDepositVoucherDialogKindEnum.PAYMENT}
        onOpenChange={(open) => {
          if (!open) closeVoucherDialogs();
        }}
        mode={voucherDialog?.mode ?? TreasuryVoucherDialogModeEnum.VIEW}
        initial={paymentDialogInitial}
        onSave={(result) => void handleSavePayment(result)}
        onRequestEdit={() =>
          setVoucherDialog((prev) => (prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev))
        }
      />

      <FundSwapDialog open={fundSwapOpen} onOpenChange={setFundSwapOpen} />

      {confirmDeleteItem ? (
        <ConfirmActionModal
          title="Xóa chứng từ thu chi"
          message={`Xác nhận xóa ${confirmDeleteItem.documentNumber || confirmDeleteItem.id}?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDeleteItem(null)}
          onConfirm={async () => {
            const itemToDelete = confirmDeleteItem;
            setConfirmDeleteItem(null);
            try {
              if (itemToDelete.kind === ReceiptDepositKind.RECEIPT) {
                await receiptMutations.remove.mutateAsync(itemToDelete.id);
              } else {
                await paymentMutations.remove.mutateAsync(itemToDelete.id);
              }
              if (selectedId === itemToDelete.id) setSelectedId(null);
              closeVoucherDialogs();
              toast.success("Đã xóa chứng từ.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Xóa thất bại.");
            }
          }}
        />
      ) : null}

      {reverseItem ? (
        <AppModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setReverseItem(null);
              setReverseReason("");
            }
          }}
          title="Đảo chứng từ"
          bodyStretch={false}
          defaultWidth={460}
          defaultHeight={260}
          minWidth={380}
          minHeight={240}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReverseItem(null);
                  setReverseReason("");
                }}
              >
                Quay lại
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={reverseLoading || !reverseReason.trim()}
                onClick={() => void handleConfirmReverse()}
              >
                {reverseLoading ? "Đang xử lý…" : "Đảo chứng từ"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground leading-relaxed">
              {`Đảo chứng từ ${reverseItem.documentNumber || reverseItem.id} sẽ tạo một bút toán bù trừ trong sổ. Hành động không thể hoàn tác.`}
            </p>
            <label className="text-sm font-medium">Lý do đảo</label>
            <textarea
              className="min-h-[72px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reverseReason}
              maxLength={500}
              placeholder="Nhập lý do đảo chứng từ…"
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
