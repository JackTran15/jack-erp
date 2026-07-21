import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  DocumentListShell,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
} from "@erp/ui";
import { CloudUpload, Loader2 } from "lucide-react";
import {
  TreasuryCashTabIdEnum,
  TreasuryTabBar,
} from "../../../components/document/treasuryTabs";
import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  DEFAULT_PAGINATION,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../components/table/pagination.dto";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../../components/crud/crudV2Search";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { useCategoryNameMap } from "../../../hooks/treasury/use-cash-voucher-categories";
import { useCashPayment } from "../../../hooks/treasury/use-cash-payments";
import { useCashReceipt } from "../../../hooks/treasury/use-cash-receipts";
import { useCashLedgerSearch } from "../../../hooks/treasury/use-cash-ledger";
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

/**
 * Column keys are named after the `POST /v2/cash-ledger/search` request fields so
 * `buildV2Body` maps the filter state straight onto the body. `receiptNo` /
 * `paymentNo` are the exception: both render the same underlying
 * `document_number`, so whichever cell the user fills becomes documentNumber.
 */
const LEDGER_CASH_FILTER_KEYS = [
  "createdAt",
  "receiptNo",
  "paymentNo",
  "description",
  "amountIn",
  "amountOut",
  "counterparty",
  "staff",
] as const;

type LedgerCashFilterKey = (typeof LEDGER_CASH_FILTER_KEYS)[number];

const LEDGER_CASH_SEARCH: V2SearchConfig = {
  path: "/v2/cash-ledger/search",
  fields: {
    createdAt: "date-range",
    documentNumber: "string",
    description: "string",
    counterparty: "string",
    staff: "string",
    amountIn: "compare",
    amountOut: "compare",
  },
};

function emptyColumnFilters(): Record<LedgerCashFilterKey, ColumnFilter> {
  return LEDGER_CASH_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<LedgerCashFilterKey, ColumnFilter>,
  );
}

export function LedgerCashPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [columnFilters, setColumnFilters] =
    useState<Record<LedgerCashFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [selectedRow, setSelectedRow] = useState<LedgerCashRow | null>(null);
  const [dialogKind, setDialogKind] = useState<LedgerCashDrillDownEnum | null>(
    null,
  );
  const [linkedInvoiceDetail, setLinkedInvoiceDetail] =
    useState<LedgerCashInvoiceDetail | null>(null);

  // Debounced so typing in a column filter settles into one request.
  const debouncedFilters = useDebouncedValue(columnFilters, 300);

  // One cash fund per branch: the backend resolves it from the active branch
  // (X-Branch-Id), so no cash-account selection is needed here.
  const searchBody = useMemo(() => {
    const merged: Record<string, ColumnFilter> = {
      ...debouncedFilters,
      createdAt: {
        ...debouncedFilters.createdAt,
        from: debouncedFilters.createdAt.from || appliedPeriod.from,
        to: debouncedFilters.createdAt.to || appliedPeriod.to,
      },
      // Both voucher-number columns render document_number; whichever the user
      // filled wins (no row carries both a receipt and a payment number).
      documentNumber: debouncedFilters.receiptNo.value
        ? debouncedFilters.receiptNo
        : debouncedFilters.paymentNo,
    };
    return buildV2Body(
      LEDGER_CASH_SEARCH,
      merged,
      pagination.page,
      pagination.pageSize,
    );
  }, [debouncedFilters, appliedPeriod, pagination]);

  const ledger = useCashLedgerSearch(searchBody);

  const categoryInMap = useCategoryNameMap(CashVoucherCategoryDirection.IN);
  const categoryOutMap = useCategoryNameMap(CashVoucherCategoryDirection.OUT);

  const selectedReceiptId =
    selectedRow?.apiLedgerKind === "PT" ? selectedRow.apiVoucherId : undefined;
  const selectedPaymentId =
    selectedRow?.apiLedgerKind === "PC" ? selectedRow.apiVoucherId : undefined;

  const { data: receiptDetail, isFetching: isReceiptFetching } =
    useCashReceipt(selectedReceiptId);
  const { data: paymentDetail, isFetching: isPaymentFetching } =
    useCashPayment(selectedPaymentId);

  const voucherDetail = useMemo(() => {
    if (selectedReceiptId && receiptDetail) {
      return cashReceiptToVoucherDetail(receiptDetail, categoryInMap);
    }
    if (selectedPaymentId && paymentDetail) {
      return cashPaymentToVoucherDetail(paymentDetail, categoryOutMap);
    }
    return null;
  }, [selectedReceiptId, selectedPaymentId, receiptDetail, paymentDetail, categoryInMap, categoryOutMap]);

  const transactionRows = ledger.transactionRows;
  const openingRow = ledger.openingRow;

  const pagedRows = useMemo(() => {
    if (!openingRow) return ledger.transactionRows;
    const pageTx = ledger.transactionRows;
    const hasOpeningOnPage =
      pagination.page === 1 && pageTx.length >= 0;
    return hasOpeningOnPage ? [openingRow, ...pageTx] : pageTx;
  }, [openingRow, ledger.transactionRows, pagination.page]);

  // Any filter change resets to page 1 — otherwise a narrowed result set can
  // leave the grid stranded on a page that no longer exists.
  const patchFilter = useCallback((key: string, patch: Partial<ColumnFilter>) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key as LedgerCashFilterKey]: {
        ...prev[key as LedgerCashFilterKey],
        ...patch,
      },
    }));
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const columnFilterControl = useMemo(
    () => ({
      filters: columnFilters as unknown as Record<string, ColumnFilter>,
      onModeChange: (key: string, mode: ColumnFilterMode) =>
        patchFilter(key, { mode }),
      onValueChange: (key: string, value: string) => patchFilter(key, { value }),
      onRangeChange: (key: string, part: "from" | "to", value: string) =>
        patchFilter(key, { [part]: value }),
    }),
    [columnFilters, patchFilter],
  );

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

  const isDetailLoading =
    dialogKind === LedgerCashDrillDownEnum.VOUCHER &&
    (isReceiptFetching || isPaymentFetching);

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
            columnFilterControl={columnFilterControl}
          />
        </div>
      </DocumentListShell>

      {isDetailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Đang tải dữ liệu...</span>
          </div>
        </div>
      )}

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
