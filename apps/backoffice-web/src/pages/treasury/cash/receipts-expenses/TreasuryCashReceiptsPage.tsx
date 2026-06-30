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
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import {
  ChevronDown,
  Copy,
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
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { useMyBranchCashAccount } from "../../../../hooks/treasury/use-cash-accounts";
import {
  useCashPayment,
  useCashPaymentMutations,
} from "../../../../hooks/treasury/use-cash-payments";
import {
  useCashReceipt,
  useCashReceiptMutations,
} from "../../../../hooks/treasury/use-cash-receipts";
import { useCategoryNameMap } from "../../../../hooks/treasury/use-cash-voucher-categories";
import { useMergedReceiptPayments } from "../../../../hooks/treasury/use-merged-receipt-payments";
import {
  cashPaymentToVoucherDetail,
  cashReceiptToVoucherDetail,
} from "../../cash-vouchers.adapters";
import {
  ledgerDetailToCreatePaymentBody,
  ledgerDetailToCreateReceiptBody,
  ledgerDetailToDebtCollectionBody,
  ledgerDetailToSupplierDebtPaymentBody,
} from "../../cash-vouchers.api-body";
import {
  CashVoucherCategoryDirection,
  CashVoucherStatus,
  ReceiptPaymentKind,
  type ReceiptPaymentListItem,
} from "../../cash-vouchers.types";
import {
  InvoiceDetailDialog,
  PaymentVoucherDialog,
  ReceiptVoucherDialog,
  TreasuryVoucherDialogModeEnum,
} from "../../documents";
import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashInvoiceDetail,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import { MOCK_LEDGER_CASH_ROWS, findLedgerCashInvoiceByCode } from "../../ledger-cash/mock-ledger-cash";
import { ReceiptCashDetailPanel } from "./ReceiptCashDetailPanel";
import {
  RECEIPT_CASH_FILTER_KEYS,
  type ReceiptCashFilterKey,
} from "./receipt-cash.constants";
import {
  ReceiptCashVoucherDialogKindEnum,
  type ReceiptCashVoucherDialogState,
} from "./receipt-cash.types";
import { useReceiptCashTableColumns } from "./useReceiptCashTableColumns";

function emptyColumnFilters(): Record<ReceiptCashFilterKey, ColumnFilter> {
  return RECEIPT_CASH_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<ReceiptCashFilterKey, ColumnFilter>,
  );
}

function dialogKindFromItem(
  item: ReceiptPaymentListItem,
): ReceiptCashVoucherDialogKindEnum {
  return item.kind === ReceiptPaymentKind.RECEIPT
    ? ReceiptCashVoucherDialogKindEnum.RECEIPT
    : ReceiptCashVoucherDialogKindEnum.PAYMENT;
}

export function TreasuryCashReceiptsPage() {
  const { data: myAccount } = useMyBranchCashAccount();
  const cashAccountId = myAccount?.id ?? "";
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<ReceiptCashFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voucherDialog, setVoucherDialog] =
    useState<ReceiptCashVoucherDialogState | null>(null);
  const [showGoodsPaymentView, setShowGoodsPaymentView] = useState(false);
  const [invoiceDetail, setInvoiceDetail] =
    useState<LedgerCashInvoiceDetail | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] =
    useState<ReceiptPaymentListItem | null>(null);
  const [reverseItem, setReverseItem] =
    useState<ReceiptPaymentListItem | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseLoading, setReverseLoading] = useState(false);

  const categoryInMap = useCategoryNameMap(CashVoucherCategoryDirection.IN);
  const categoryOutMap = useCategoryNameMap(CashVoucherCategoryDirection.OUT);

  const listQuery = useMemo(
    () => ({
      cashAccountId: cashAccountId || undefined,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
      page: 1,
      pageSize: 100,
    }),
    [cashAccountId, appliedPeriod],
  );

  const { merged, isLoading, refetch } = useMergedReceiptPayments(
    listQuery,
    listQuery,
    { from: appliedPeriod.from, to: appliedPeriod.to },
    Boolean(cashAccountId),
  );

  const listRows = merged.data ?? [];

  const selectedItem = useMemo(
    () => listRows.find((r) => r.id === selectedId) ?? null,
    [listRows, selectedId],
  );

  const { data: receiptDetail } = useCashReceipt(
    selectedItem?.kind === ReceiptPaymentKind.RECEIPT
      ? (selectedId ?? undefined)
      : undefined,
  );
  const { data: paymentDetail } = useCashPayment(
    selectedItem?.kind === ReceiptPaymentKind.PAYMENT
      ? (selectedId ?? undefined)
      : undefined,
  );

  const selectedVoucher: LedgerCashVoucherDetail | null = useMemo(() => {
    if (receiptDetail) {
      return cashReceiptToVoucherDetail(receiptDetail, categoryInMap);
    }
    if (paymentDetail) {
      return cashPaymentToVoucherDetail(paymentDetail, categoryOutMap);
    }
    return null;
  }, [receiptDetail, paymentDetail, categoryInMap, categoryOutMap]);

  const detailLines = selectedVoucher?.lines ?? [];

  const filteredRows = useMemo(() => {
    return listRows.filter((row) => {
      const dateText = new Date(
        `${row.voucherDate}T12:00:00`,
      ).toLocaleDateString("vi-VN");
      const typeLabel =
        row.kind === ReceiptPaymentKind.RECEIPT
          ? "Phiếu thu tiền mặt"
          : row.isGoodsReceiptPayment
            ? "Phiếu nhập hàng - Tiền mặt"
            : "Phiếu chi tiền mặt";
      return (
        applyColumnFilter(
          toComparableText(dateText),
          columnFilters.documentDate,
        ) &&
        applyColumnFilter(
          toComparableText(row.documentNumber),
          columnFilters.voucherNo,
        ) &&
        applyColumnFilter(
          toComparableText(typeLabel),
          columnFilters.documentTypeLabel,
        ) &&
        applyColumnFilter(
          toComparableText(row.totalAmount),
          columnFilters.totalAmount,
        ) &&
        applyColumnFilter(
          toComparableText(row.counterparty),
          columnFilters.counterparty,
        ) &&
        applyColumnFilter(toComparableText(row.reason), columnFilters.reason)
      );
    });
  }, [listRows, columnFilters]);

  const total = filteredRows.length;
  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredRows.slice(start, start + pagination.pageSize);
  }, [filteredRows, pagination]);

  const receiptMutations = useCashReceiptMutations();
  const paymentMutations = useCashPaymentMutations();

  const closeVoucherDialogs = useCallback(() => {
    setVoucherDialog(null);
    setShowGoodsPaymentView(false);
  }, []);

  const openViewVoucher = useCallback((item: ReceiptPaymentListItem) => {
    setSelectedId(item.id);
    if (item.isGoodsReceiptPayment) {
      setVoucherDialog(null);
      setShowGoodsPaymentView(true);
      return;
    }
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: dialogKindFromItem(item),
      mode: TreasuryVoucherDialogModeEnum.VIEW,
    });
  }, []);

  const openEditVoucher = useCallback((item: ReceiptPaymentListItem) => {
    setSelectedId(item.id);
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: dialogKindFromItem(item),
      mode: TreasuryVoucherDialogModeEnum.EDIT,
    });
  }, []);

  const openInvoiceByCode = useCallback((code: string) => {
    const inv = findLedgerCashInvoiceByCode(code, MOCK_LEDGER_CASH_ROWS);
    if (!inv) {
      toast.info(`Không tìm thấy hóa đơn ${code} (cần API hóa đơn — G4).`);
      return;
    }
    setInvoiceDetail(inv);
  }, []);

  const columns = useReceiptCashTableColumns((row) => openViewVoucher(row));

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as ReceiptCashFilterKey]: {
            ...prev[key as ReceiptCashFilterKey],
            mode,
          },
        })),
      onValueChange: (key: string, value: string) =>
        setColumnFilters((prev) => ({
          ...prev,
          [key as ReceiptCashFilterKey]: {
            ...prev[key as ReceiptCashFilterKey],
            value,
          },
        })),
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
    closeVoucherDialogs();
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu.");
  }, [refetch, closeVoucherDialogs]);

  const canEditSelected =
    !!selectedItem &&
    !selectedItem.isGoodsReceiptPayment &&
    selectedItem.status === CashVoucherStatus.DRAFT;

  const handlePageEdit = useCallback(() => {
    if (!selectedItem || selectedItem.isGoodsReceiptPayment) return;
    if (
      voucherDialog?.mode === TreasuryVoucherDialogModeEnum.VIEW &&
      voucherDialog.kind === dialogKindFromItem(selectedItem)
    ) {
      setVoucherDialog((prev) =>
        prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev,
      );
      return;
    }
    openEditVoucher(selectedItem);
  }, [selectedItem, voucherDialog, openEditVoucher]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "clone",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selectedItem || selectedItem.isGoodsReceiptPayment,
      tooltip: selectedItem?.isGoodsReceiptPayment
        ? "Không nhân bản phiếu nhập hàng"
        : undefined,
      onClick: async () => {
        if (!selectedVoucher || !cashAccountId) return;
        try {
          if (selectedItem?.kind === ReceiptPaymentKind.RECEIPT) {
            const body = ledgerDetailToCreateReceiptBody(
              { ...selectedVoucher, voucherNo: "" },
              cashAccountId,
            );
            const created = await receiptMutations.create.mutateAsync(body);
            setSelectedId(created.id);
          } else {
            const body = ledgerDetailToCreatePaymentBody(
              { ...selectedVoucher, voucherNo: "" },
              cashAccountId,
            );
            const created = await paymentMutations.create.mutateAsync(body);
            setSelectedId(created.id);
          }
          toast.success("Đã nhân bản chứng từ.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Nhân bản thất bại.");
        }
      },
    },
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
      tooltip: selectedItem?.isGoodsReceiptPayment
        ? "Phiếu nhập hàng chỉ xem"
        : selectedItem?.status !== CashVoucherStatus.DRAFT
          ? "Chỉ sửa phiếu nháp"
          : undefined,
      onClick: handlePageEdit,
    },
    {
      id: "reverse",
      label: "Đảo",
      icon: RotateCcw,
      disabled:
        !selectedItem || selectedItem.status !== CashVoucherStatus.POSTED,
      tooltip:
        selectedItem && selectedItem.status !== CashVoucherStatus.POSTED
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
      disabled:
        !selectedItem || selectedItem.status !== CashVoucherStatus.DRAFT,
      onClick: () => {
        if (selectedItem) setConfirmDeleteItem(selectedItem);
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

  const listTotal = useMemo(
    () => filteredRows.reduce((s, r) => s + r.totalAmount, 0),
    [filteredRows],
  );

  const openCreateReceipt = useCallback(() => {
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: ReceiptCashVoucherDialogKindEnum.RECEIPT,
      mode: TreasuryVoucherDialogModeEnum.CREATE,
    });
  }, []);

  const openCreatePayment = useCallback(() => {
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: ReceiptCashVoucherDialogKindEnum.PAYMENT,
      mode: TreasuryVoucherDialogModeEnum.CREATE,
    });
  }, []);

  const handleSaveVoucher = useCallback(
    async (detail: LedgerCashVoucherDetail) => {
      if (!voucherDialog || !cashAccountId) {
        toast.error("Chưa chọn két tiền.");
        return;
      }
      try {
        if (voucherDialog.kind === ReceiptCashVoucherDialogKindEnum.RECEIPT) {
          const isDebtCollection =
            detail.purpose === LedgerCashVoucherPurposeEnum.DEBT_COLLECTION;
          if (
            isDebtCollection &&
            voucherDialog.mode === TreasuryVoucherDialogModeEnum.CREATE
          ) {
            // Thu hồi nợ: settle the picked invoice debts + credit the két (saga).
            const body = ledgerDetailToDebtCollectionBody(detail, cashAccountId);
            if (body.allocations.length === 0) {
              toast.error("Chọn ít nhất một hóa đơn nợ để thu.");
              return;
            }
            const result =
              await receiptMutations.debtCollection.mutateAsync(body);
            setSelectedId(result.receiptId);
          } else {
            const body = ledgerDetailToCreateReceiptBody(detail, cashAccountId);
            if (voucherDialog.mode === TreasuryVoucherDialogModeEnum.CREATE) {
              const created = await receiptMutations.create.mutateAsync(body);
              setSelectedId(created.id);
            } else if (selectedId) {
              const { documentNumber: _, ...updateBody } = body;
              await receiptMutations.update.mutateAsync({
                id: selectedId,
                body: updateBody,
              });
            }
          }
        } else {
          const isSupplierDebtRepayment =
            detail.purpose === LedgerCashVoucherPurposeEnum.DEBT_REPAYMENT;
          if (
            isSupplierDebtRepayment &&
            voucherDialog.mode === TreasuryVoucherDialogModeEnum.CREATE
          ) {
            const body = ledgerDetailToSupplierDebtPaymentBody(detail, cashAccountId);
            if (body.allocations.length === 0) {
              toast.error("Chọn ít nhất một hóa đơn nợ để trả.");
              return;
            }
            const result =
              await paymentMutations.supplierDebtPayment.mutateAsync(body);
            setSelectedId(result.paymentId);
          } else {
            const body = ledgerDetailToCreatePaymentBody(detail, cashAccountId);
            if (voucherDialog.mode === TreasuryVoucherDialogModeEnum.CREATE) {
              const created = await paymentMutations.create.mutateAsync(body);
              setSelectedId(created.id);
            } else if (selectedId) {
              const { documentNumber: _, ...updateBody } = body;
              await paymentMutations.update.mutateAsync({
                id: selectedId,
                body: updateBody,
              });
            }
          }
        }
        closeVoucherDialogs();
        toast.success("Đã ghi sổ chứng từ.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lưu thất bại.");
      }
    },
    [
      voucherDialog,
      cashAccountId,
      selectedId,
      receiptMutations,
      paymentMutations,
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
      if (reverseItem.kind === ReceiptPaymentKind.RECEIPT) {
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
      : selectedVoucher;

  const goodsPaymentDetail =
    showGoodsPaymentView &&
    selectedVoucher?.kind === LedgerCashVoucherKindEnum.PAYMENT
      ? selectedVoucher
      : null;

  return (
    <>
      <DocumentListShell
        title="Tiền mặt"
        tabs={
          <TreasuryTabBar activeId={TreasuryCashTabIdEnum.RECEIPTS_EXPENSES} />
        }
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
                  Phiếu thu tiền
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    openCreatePayment();
                  }}
                >
                  Phiếu chi tiền
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        summary={
          <div className="flex items-center justify-end gap-6 px-2">
            <span className="text-muted-foreground">Tổng tiền:</span>
            <span className="text-base font-semibold">
              {formatMoneyInteger(listTotal)}
            </span>
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
        detailPanel={<ReceiptCashDetailPanel lines={detailLines} />}
      >
        <BaseDataTable
          columns={columns}
          rows={pagedRows}
          loading={isLoading}
          emptyLabel="Không có chứng từ thu chi tiền mặt trong kỳ đã chọn."
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
                onChange={() =>
                  setSelectedId(selectedId === row.id ? null : row.id)
                }
                onClick={(e) => e.stopPropagation()}
              />
            ),
          }}
        />
      </DocumentListShell>

      <ReceiptVoucherDialog
        open={
          !!voucherDialog &&
          voucherDialog.kind === ReceiptCashVoucherDialogKindEnum.RECEIPT
        }
        onOpenChange={(open) => {
          if (!open) closeVoucherDialogs();
        }}
        mode={voucherDialog?.mode ?? TreasuryVoucherDialogModeEnum.VIEW}
        initial={dialogInitial}
        onSave={handleSaveVoucher}
        onRequestEdit={() =>
          setVoucherDialog((prev) =>
            prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev,
          )
        }
        onOpenInvoice={openInvoiceByCode}
      />

      <PaymentVoucherDialog
        open={
          (!!voucherDialog &&
            voucherDialog.kind === ReceiptCashVoucherDialogKindEnum.PAYMENT) ||
          showGoodsPaymentView
        }
        onOpenChange={(open) => {
          if (!open) closeVoucherDialogs();
        }}
        mode={
          showGoodsPaymentView
            ? TreasuryVoucherDialogModeEnum.VIEW
            : (voucherDialog?.mode ?? TreasuryVoucherDialogModeEnum.VIEW)
        }
        initial={goodsPaymentDetail ?? dialogInitial}
        onSave={showGoodsPaymentView ? undefined : handleSaveVoucher}
        onRequestEdit={
          showGoodsPaymentView
            ? undefined
            : () =>
                setVoucherDialog((prev) =>
                  prev
                    ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT }
                    : prev,
                )
        }
      />

      <InvoiceDetailDialog
        open={!!invoiceDetail}
        onOpenChange={(open) => {
          if (!open) setInvoiceDetail(null);
        }}
        detail={invoiceDetail}
      />

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
              if (itemToDelete.kind === ReceiptPaymentKind.RECEIPT) {
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
                onClick={handleConfirmReverse}
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
