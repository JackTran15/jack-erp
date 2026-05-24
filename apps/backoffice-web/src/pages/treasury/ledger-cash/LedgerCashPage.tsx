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
import {
  InvoiceDetailDialog,
  PaymentVoucherDialog,
  ReceiptVoucherDialog,
  TreasuryVoucherDialogModeEnum,
} from "../documents";
import { LedgerCashTable } from "./components/ledger/LedgerCashTable";
import {
  buildLedgerCashViewRows,
  findLedgerCashInvoiceByCode,
  MOCK_LEDGER_CASH_ROWS,
} from "./mock-ledger-cash";
import {
  LedgerCashDetailTypeEnum,
  LedgerCashDocumentTypeEnum,
  LedgerCashDrillDownEnum,
  LedgerCashVoucherKindEnum,
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

  const openInvoiceByCode = useCallback((code: string) => {
    const inv = findLedgerCashInvoiceByCode(code, MOCK_LEDGER_CASH_ROWS);
    if (!inv) {
      toast.info(`Không tìm thấy hóa đơn ${code}.`);
      return;
    }
    setLinkedInvoiceDetail(inv);
  }, []);

  const receiptVoucherOpen =
    dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
    voucherDetail?.kind === LedgerCashVoucherKindEnum.RECEIPT;
  const paymentVoucherOpen =
    dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
    voucherDetail?.kind === LedgerCashVoucherKindEnum.PAYMENT;

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

      <InvoiceDetailDialog
        open={
          dialogKind === LedgerCashDrillDownEnum.INVOICE ||
          !!linkedInvoiceDetail
        }
        onOpenChange={(open) => {
          if (!open) {
            setLinkedInvoiceDetail(null);
            if (dialogKind === LedgerCashDrillDownEnum.INVOICE) {
              setDialogKind(null);
              setSelectedRow(null);
            }
          }
        }}
        detail={linkedInvoiceDetail ?? invoiceDetail}
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
