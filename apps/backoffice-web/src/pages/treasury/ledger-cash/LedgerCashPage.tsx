import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  DocumentListShell,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { CloudUpload } from "lucide-react";
import {
  TreasuryCashTabIdEnum,
  TreasuryTabBar,
} from "../../../components/document/treasuryTabs";
import { PaginationControls } from "../../../components/table/PaginationControls";
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
import { useCategoryNameMap } from "../../../hooks/treasury/use-cash-voucher-categories";
import { useCashPayment } from "../../../hooks/treasury/use-cash-payments";
import { useCashReceipt } from "../../../hooks/treasury/use-cash-receipts";
import { useCashLedgerOffsetPage } from "../../../hooks/treasury/use-cash-ledger";
import {
  cashPaymentToVoucherDetail,
  cashReceiptToVoucherDetail,
} from "../cash-vouchers.adapters";
import { CashVoucherCategoryDirection } from "../cash-vouchers.types";
import {
  InvoiceDetailDialog,
  PaymentVoucherDialog,
  ReceiptVoucherDialog,
  TreasuryVoucherDialogModeEnum,
} from "../documents";
import { LedgerCashTable } from "./components/ledger/LedgerCashTable";
import { findLedgerCashInvoiceByCode, MOCK_LEDGER_CASH_ROWS } from "./mock-ledger-cash";
import {
  LedgerCashDrillDownEnum,
  LedgerCashVoucherKindEnum,
  isOpeningBalanceRow,
  resolveLedgerCashDrillDown,
  type LedgerCashInvoiceDetail,
  type LedgerCashRow,
} from "./ledger-cash.types";

export function LedgerCashPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [selectedRow, setSelectedRow] = useState<LedgerCashRow | null>(null);
  const [dialogKind, setDialogKind] = useState<LedgerCashDrillDownEnum | null>(
    null,
  );
  const [linkedInvoiceDetail, setLinkedInvoiceDetail] =
    useState<LedgerCashInvoiceDetail | null>(null);

  // One cash fund per branch: the backend resolves it from the active branch
  // (X-Branch-Id), so no cash-account selection is needed here.
  const ledgerParams = useMemo(
    () => ({
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
    }),
    [appliedPeriod],
  );

  const ledger = useCashLedgerOffsetPage(
    ledgerParams,
    pagination.page,
    pagination.pageSize,
    true,
  );

  const categoryInMap = useCategoryNameMap(CashVoucherCategoryDirection.IN);
  const categoryOutMap = useCategoryNameMap(CashVoucherCategoryDirection.OUT);

  const { data: receiptDetail } = useCashReceipt(
    selectedRow?.apiLedgerKind === "PT" ? selectedRow.apiVoucherId : undefined,
  );
  const { data: paymentDetail } = useCashPayment(
    selectedRow?.apiLedgerKind === "PC" ? selectedRow.apiVoucherId : undefined,
  );

  const voucherDetail = useMemo(() => {
    if (receiptDetail) {
      return cashReceiptToVoucherDetail(receiptDetail, categoryInMap);
    }
    if (paymentDetail) {
      return cashPaymentToVoucherDetail(paymentDetail, categoryOutMap);
    }
    return null;
  }, [receiptDetail, paymentDetail, categoryInMap, categoryOutMap, selectedRow]);

  const transactionRows = ledger.transactionRows;
  const openingRow = ledger.openingRow;

  const pagedRows = useMemo(() => {
    if (!openingRow) return ledger.transactionRows;
    const pageTx = ledger.transactionRows;
    const hasOpeningOnPage =
      pagination.page === 1 && pageTx.length >= 0;
    return hasOpeningOnPage ? [openingRow, ...pageTx] : pageTx;
  }, [openingRow, ledger.transactionRows, pagination.page]);

  const openDrillDown = useCallback((row: LedgerCashRow) => {
    if (isOpeningBalanceRow(row)) return;
    const kind = resolveLedgerCashDrillDown(row);
    if (!kind) return;
    setSelectedRow(row);
    setDialogKind(kind);
  }, []);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    ledger.refetch();
    toast.success("Đã nạp dữ liệu.");
  }, [period, ledger]);

  const openInvoiceByCode = useCallback((code: string) => {
    const inv = findLedgerCashInvoiceByCode(code, MOCK_LEDGER_CASH_ROWS);
    if (!inv) {
      toast.info(`Không tìm thấy hóa đơn ${code} (G4).`);
      return;
    }
    setLinkedInvoiceDetail(inv);
  }, []);

  const receiptVoucherOpen =
    dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
    (voucherDetail?.kind === LedgerCashVoucherKindEnum.RECEIPT ||
      selectedRow?.apiLedgerKind === "PT");
  const paymentVoucherOpen =
    dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
    (voucherDetail?.kind === LedgerCashVoucherKindEnum.PAYMENT ||
      selectedRow?.apiLedgerKind === "PC");

  return (
    <>
      <DocumentListShell
        title="Tiền mặt"
        tabs={<TreasuryTabBar activeId={TreasuryCashTabIdEnum.LEDGER} />}
        filters={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-end gap-4">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                onApply={handleApply}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info("Tính năng xuất khẩu sẽ được bổ sung.")}
            >
              <CloudUpload className="mr-1 h-4 w-4" /> Xuất khẩu
            </Button>
          </div>
        }
        pagination={
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={ledger.total}
            onPageChange={(p) =>
              setPagination((prev) => ({ ...prev, page: p }))
            }
            onPageSizeChange={(s) =>
              setPagination((prev) => ({ ...prev, page: 1, pageSize: s }))
            }
          />
        }
      >
        <div className="flex min-h-[calc(100vh-15rem)] flex-1 flex-col p-4">
          <LedgerCashTable
            rows={pagedRows}
            transactionRows={transactionRows}
            loading={ledger.isLoading}
            totalDebit={ledger.totalDebit}
            totalCredit={ledger.totalCredit}
            closingBalance={ledger.closingBalance}
            onDrillDown={openDrillDown}
          />
        </div>
      </DocumentListShell>

      <InvoiceDetailDialog
        open={dialogKind === LedgerCashDrillDownEnum.INVOICE || !!linkedInvoiceDetail}
        onOpenChange={(open) => {
          if (!open) {
            setLinkedInvoiceDetail(null);
            if (dialogKind === LedgerCashDrillDownEnum.INVOICE) {
              setDialogKind(null);
              setSelectedRow(null);
            }
          }
        }}
        detail={linkedInvoiceDetail}
      />

      <ReceiptVoucherDialog
        open={receiptVoucherOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogKind(null);
            setSelectedRow(null);
          }
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={
          voucherDetail?.kind === LedgerCashVoucherKindEnum.RECEIPT
            ? voucherDetail
            : null
        }
        onOpenInvoice={openInvoiceByCode}
      />

      <PaymentVoucherDialog
        open={paymentVoucherOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogKind(null);
            setSelectedRow(null);
          }
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={
          voucherDetail?.kind === LedgerCashVoucherKindEnum.PAYMENT
            ? voucherDetail
            : null
        }
      />
    </>
  );
}
