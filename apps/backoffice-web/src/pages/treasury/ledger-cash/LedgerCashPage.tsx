import { useCallback, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { PaginationControls } from "../../../components/table/PaginationControls";
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
import { LedgerCashInvoiceDetailDialog } from "./components/invoice-dialog/LedgerCashInvoiceDetailDialog";
import { LedgerCashPaymentVoucherDialog } from "./components/payment-voucher-dialog/LedgerCashPaymentVoucherDialog";
import { LedgerCashReceiptVoucherDialog } from "./components/receipt-voucher-dialog/LedgerCashReceiptVoucherDialog";
import { LedgerCashTable } from "./components/ledger/LedgerCashTable";
import {
  buildLedgerCashViewRows,
  MOCK_LEDGER_CASH_ROWS,
} from "./mock-ledger-cash";
import {
  LedgerCashDetailTypeEnum,
  LedgerCashDocumentTypeEnum,
  LedgerCashDrillDownEnum,
  LedgerCashVoucherKindEnum,
  resolveLedgerCashDrillDown,
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

  const { openingRow, transactionRows } = useMemo(() => {
    if (!appliedPeriod.from || !appliedPeriod.to) {
      const opening =
        MOCK_LEDGER_CASH_ROWS.find(
          (r) => r.documentType === LedgerCashDocumentTypeEnum.OPENING_BALANCE,
        ) ?? null;
      const transactions = MOCK_LEDGER_CASH_ROWS.filter(
        (r) => r.documentType !== LedgerCashDocumentTypeEnum.OPENING_BALANCE,
      );
      return { openingRow: opening, transactionRows: transactions };
    }
    const built = buildLedgerCashViewRows(
      MOCK_LEDGER_CASH_ROWS,
      appliedPeriod.from,
      appliedPeriod.to,
    );
    return {
      openingRow: built.opening,
      transactionRows: built.transactions,
    };
  }, [appliedPeriod]);

  const total = transactionRows.length;
  const pagedRows = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    const pageTransactions = transactionRows.slice(
      start,
      start + pagination.pageSize,
    );
    return openingRow ? [openingRow, ...pageTransactions] : pageTransactions;
  }, [openingRow, transactionRows, pagination]);

  const openDrillDown = useCallback((row: LedgerCashRow) => {
    const kind = resolveLedgerCashDrillDown(row);
    if (!kind) return;
    setSelectedRow(row);
    setDialogKind(kind);
  }, []);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp dữ liệu.");
  }, [period]);

  const invoiceDetail =
    selectedRow?.detail.type === LedgerCashDetailTypeEnum.INVOICE
      ? selectedRow.detail.data
      : null;
  const voucherDetail =
    selectedRow?.detail.type === LedgerCashDetailTypeEnum.VOUCHER
      ? selectedRow.detail.data
      : null;

  return (
    <>
      <DocumentListShell
        title="Tiền mặt"
        tabs={<TreasuryTabBar activeId={TreasuryCashTabIdEnum.LEDGER} />}
        filters={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              onApply={handleApply}
            />
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
            total={total}
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
            onDrillDown={openDrillDown}
          />
        </div>
      </DocumentListShell>

      <LedgerCashInvoiceDetailDialog
        open={dialogKind === LedgerCashDrillDownEnum.INVOICE}
        onOpenChange={(open) => {
          if (!open) {
            setDialogKind(null);
            setSelectedRow(null);
          }
        }}
        detail={invoiceDetail}
      />

      <LedgerCashReceiptVoucherDialog
        open={
          dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
          voucherDetail?.kind === LedgerCashVoucherKindEnum.RECEIPT
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogKind(null);
            setSelectedRow(null);
          }
        }}
        detail={
          voucherDetail?.kind === LedgerCashVoucherKindEnum.RECEIPT
            ? voucherDetail
            : null
        }
      />

      <LedgerCashPaymentVoucherDialog
        open={
          dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
          voucherDetail?.kind === LedgerCashVoucherKindEnum.PAYMENT
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialogKind(null);
            setSelectedRow(null);
          }
        }}
        detail={
          voucherDetail?.kind === LedgerCashVoucherKindEnum.PAYMENT
            ? voucherDetail
            : null
        }
      />
    </>
  );
}
