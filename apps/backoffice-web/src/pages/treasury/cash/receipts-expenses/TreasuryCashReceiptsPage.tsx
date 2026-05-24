import { useCallback, useMemo, useState } from "react";
import {
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
  Trash2,
} from "lucide-react";
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
import {
  LedgerCashVoucherKindEnum,
  type LedgerCashInvoiceDetail,
  type LedgerCashRow,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import { MOCK_LEDGER_CASH_ROWS } from "../../ledger-cash/mock-ledger-cash";
import {
  InvoiceDetailDialog,
  PaymentVoucherDialog,
  ReceiptVoucherDialog,
  TreasuryVoucherDialogModeEnum,
} from "../../documents";
import { ReceiptCashDetailPanel } from "./ReceiptCashDetailPanel";
import { filterReceiptCashRowsByPeriod } from "./mock-receipt-cash";
import {
  RECEIPT_CASH_FILTER_KEYS,
  type ReceiptCashFilterKey,
} from "./receipt-cash.constants";
import {
  ReceiptCashVoucherDialogKindEnum,
  type ReceiptCashVoucherDialogState,
} from "./receipt-cash.types";
import { findLedgerCashInvoiceByCode } from "../../ledger-cash/mock-ledger-cash";
import {
  getReceiptCashVoucherNo,
  getVoucherDetailFromRow,
  isGoodsReceiptPaymentRow,
  isReceiptRow,
  nextPaymentVoucherNo,
  nextReceiptVoucherNo,
  toReceiptCashListRow,
} from "./receipt-cash.utils";
import { useReceiptCashMockStore } from "./useReceiptCashMockStore";
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

function dialogKindFromRow(
  row: LedgerCashRow,
): ReceiptCashVoucherDialogKindEnum {
  return isReceiptRow(row)
    ? ReceiptCashVoucherDialogKindEnum.RECEIPT
    : ReceiptCashVoucherDialogKindEnum.PAYMENT;
}

export function TreasuryCashReceiptsPage() {
  const mockStore = useReceiptCashMockStore();
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
  const [confirmDeleteRow, setConfirmDeleteRow] =
    useState<LedgerCashRow | null>(null);

  const periodRows = useMemo(
    () =>
      filterReceiptCashRowsByPeriod(
        mockStore.rows,
        appliedPeriod.from,
        appliedPeriod.to,
      ),
    [mockStore.rows, appliedPeriod],
  );

  const listRows = useMemo(
    () => periodRows.map(toReceiptCashListRow),
    [periodRows],
  );

  const filteredRows = useMemo(() => {
    return listRows.filter((row) => {
      const dateText = row.documentDate.toLocaleDateString("vi-VN");
      return (
        applyColumnFilter(
          toComparableText(dateText),
          columnFilters.documentDate,
        ) &&
        applyColumnFilter(
          toComparableText(row.voucherNo),
          columnFilters.voucherNo,
        ) &&
        applyColumnFilter(
          toComparableText(row.documentTypeLabel),
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
        applyColumnFilter(
          toComparableText(row.description),
          columnFilters.reason,
        )
      );
    });
  }, [listRows, columnFilters]);

  const total = filteredRows.length;
  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filteredRows.slice(start, start + pagination.pageSize);
  }, [filteredRows, pagination]);

  const selectedRow = mockStore.getRowById(selectedId);
  const selectedVoucher = getVoucherDetailFromRow(selectedRow);
  const detailLines = selectedVoucher?.lines ?? [];

  const voucherNos = useMemo(
    () => mockStore.rows.map(getReceiptCashVoucherNo),
    [mockStore.rows],
  );

  const closeVoucherDialogs = useCallback(() => {
    setVoucherDialog(null);
    setShowGoodsPaymentView(false);
  }, []);

  const openViewVoucher = useCallback((row: LedgerCashRow) => {
    setSelectedId(row.id);
    if (isGoodsReceiptPaymentRow(row)) {
      setVoucherDialog(null);
      setShowGoodsPaymentView(true);
      return;
    }
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: dialogKindFromRow(row),
      mode: TreasuryVoucherDialogModeEnum.VIEW,
    });
  }, []);

  const openEditVoucher = useCallback((row: LedgerCashRow) => {
    setSelectedId(row.id);
    setShowGoodsPaymentView(false);
    setVoucherDialog({
      kind: dialogKindFromRow(row),
      mode: TreasuryVoucherDialogModeEnum.EDIT,
    });
  }, []);

  const openInvoiceByCode = useCallback(
    (code: string) => {
      const inv =
        findLedgerCashInvoiceByCode(code, MOCK_LEDGER_CASH_ROWS) ??
        findLedgerCashInvoiceByCode(code, mockStore.rows);
      if (!inv) {
        toast.info(`Không tìm thấy hóa đơn ${code}.`);
        return;
      }
      setInvoiceDetail(inv);
    },
    [mockStore.rows],
  );

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
    toast.success("Đã nạp dữ liệu.");
  }, [period]);

  const handleReload = useCallback(() => {
    mockStore.reloadFromSeed();
    setSelectedId(null);
    closeVoucherDialogs();
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp lại dữ liệu mẫu.");
  }, [mockStore, closeVoucherDialogs]);

  const canEditSelected =
    !!selectedRow && !isGoodsReceiptPaymentRow(selectedRow);

  const handlePageEdit = useCallback(() => {
    if (!selectedRow || isGoodsReceiptPaymentRow(selectedRow)) return;
    if (
      voucherDialog?.mode === TreasuryVoucherDialogModeEnum.VIEW &&
      voucherDialog.kind === dialogKindFromRow(selectedRow)
    ) {
      setVoucherDialog((prev) =>
        prev ? { ...prev, mode: TreasuryVoucherDialogModeEnum.EDIT } : prev,
      );
      return;
    }
    openEditVoucher(selectedRow);
  }, [selectedRow, voucherDialog, openEditVoucher]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "clone",
      label: "Nhân bản",
      icon: Copy,
      disabled: !selectedRow || isGoodsReceiptPaymentRow(selectedRow),
      tooltip: isGoodsReceiptPaymentRow(selectedRow)
        ? "Không nhân bản phiếu nhập hàng"
        : undefined,
      onClick: () => {
        if (!selectedId) return;
        const dup = mockStore.duplicateRow(selectedId);
        if (dup) {
          setSelectedId(dup.id);
          toast.success("Đã nhân bản chứng từ.");
        }
      },
    },
    {
      id: "view",
      label: "Xem",
      icon: Eye,
      disabled: !selectedRow,
      onClick: () => {
        if (selectedRow) openViewVoucher(selectedRow);
      },
    },
    {
      id: "edit",
      label: "Sửa",
      icon: Pencil,
      disabled: !canEditSelected,
      tooltip: isGoodsReceiptPaymentRow(selectedRow)
        ? "Phiếu nhập hàng chỉ xem"
        : undefined,
      onClick: handlePageEdit,
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
      disabled: !selectedRow,
      onClick: () => {
        if (selectedRow) setConfirmDeleteRow(selectedRow);
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

  const listTotal = useMemo(
    () => filteredRows.reduce((s, r) => s + r.totalAmount, 0),
    [filteredRows],
  );

  const openCreateReceipt = useCallback(() => {
    window.setTimeout(() => {
      setShowGoodsPaymentView(false);
      setVoucherDialog({
        kind: ReceiptCashVoucherDialogKindEnum.RECEIPT,
        mode: TreasuryVoucherDialogModeEnum.CREATE,
      });
    }, 0);
  }, []);

  const openCreatePayment = useCallback(() => {
    window.setTimeout(() => {
      setShowGoodsPaymentView(false);
      setVoucherDialog({
        kind: ReceiptCashVoucherDialogKindEnum.PAYMENT,
        mode: TreasuryVoucherDialogModeEnum.CREATE,
      });
    }, 0);
  }, []);

  const handleSaveVoucher = useCallback(
    (detail: LedgerCashVoucherDetail) => {
      if (!voucherDialog) return;

      if (voucherDialog.mode === TreasuryVoucherDialogModeEnum.CREATE) {
        const added = mockStore.addRow(detail);
        setSelectedId(added.id);
      } else if (
        voucherDialog.mode === TreasuryVoucherDialogModeEnum.EDIT &&
        selectedId
      ) {
        mockStore.updateRow(selectedId, detail);
      }
      closeVoucherDialogs();
    },
    [voucherDialog, mockStore, selectedId, closeVoucherDialogs],
  );

  const nextVoucherNo = useMemo(() => {
    if (!voucherDialog) return "";
    return voucherDialog.kind === ReceiptCashVoucherDialogKindEnum.RECEIPT
      ? nextReceiptVoucherNo(voucherNos)
      : nextPaymentVoucherNo(voucherNos);
  }, [voucherDialog, voucherNos]);

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
                  className="flex items-center gap-1.5 rounded-none bg-[#1f2d8a] px-3 py-2 text-sm font-medium text-white hover:bg-[#1a266f]"
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
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onApply={handleApply}
          />
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
          loading={false}
          emptyLabel="Không có chứng từ thu chi tiền mặt trong kỳ đã chọn."
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          columnFilterControl={columnFilterControl}
          leadingColumn={{
            width: 36,
            header: <span className="sr-only">Chọn</span>,
            cell: (row) => (
              <input
                type="checkbox"
                aria-label={`Chọn ${row.voucherNo}`}
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
        nextVoucherNo={nextVoucherNo}
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
        nextVoucherNo={nextVoucherNo}
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

      {confirmDeleteRow ? (
        <ConfirmActionModal
          title="Xóa chứng từ thu chi"
          message={`Xác nhận xóa ${getReceiptCashVoucherNo(confirmDeleteRow)}?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDeleteRow(null)}
          onConfirm={() => {
            mockStore.removeRow(confirmDeleteRow.id);
            if (selectedId === confirmDeleteRow.id) setSelectedId(null);
            closeVoucherDialogs();
            setConfirmDeleteRow(null);
            toast.success("Đã xóa chứng từ.");
          }}
        />
      ) : null}
    </>
  );
}
