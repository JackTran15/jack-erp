import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Button,
  DocumentListShell,
  PeriodFilter,
  SingleSelect,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
  type SingleSelectOption,
} from "@erp/ui";
import { CloudUpload, HelpCircle } from "lucide-react";
import { DepositMovementSource, type DepositLedgerRow } from "@erp/shared-interfaces";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
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
import {
  DepositTabBar,
  DepositTabIdEnum,
} from "../../../components/document/depositTabs";
import { useDepositAccounts } from "../../../hooks/treasury/use-deposit-accounts";
import { selectDepositBalances } from "../../../hooks/treasury/use-deposit-balance";
import {
  downloadDepositLedgerExport,
  useDepositLedgerSearch,
} from "../../../hooks/treasury/use-deposit-ledger";
import { useBankReceipt } from "../../../hooks/treasury/use-bank-receipts";
import { useBankPayment } from "../../../hooks/treasury/use-bank-payments";
import {
  DepositPaymentVoucherDialog,
  DepositReceiptVoucherDialog,
  InvoiceDetailDialog,
  TreasuryVoucherDialogModeEnum,
  VoucherLink,
} from "../documents";
import { useInvoiceDetailByCode } from "../../../hooks/treasury/use-invoice-detail";

const VI_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const NUM_CLASS = "text-right tabular-nums";

/**
 * Column keys are named after the `POST /v2/deposit-ledger/search` request
 * fields so `buildV2Body` maps the filter state straight onto the body.
 * `receiptNo`/`paymentNo` are the exception: both render the same underlying
 * `document_number`, so whichever cell the user fills becomes documentNumber.
 */
const LEDGER_FILTER_KEYS = [
  "docDate",
  "receiptNo",
  "paymentNo",
  "accountNo",
  "description",
  "amountIn",
  "amountOut",
  "counterparty",
  "staff",
] as const;

type LedgerFilterKey = (typeof LEDGER_FILTER_KEYS)[number];

const LEDGER_SEARCH: V2SearchConfig = {
  path: "/v2/deposit-ledger/search",
  fields: {
    docDate: "date-range",
    documentNumber: "string",
    accountNo: "string",
    description: "string",
    amountIn: "compare",
    amountOut: "compare",
    counterparty: "string",
    staff: "string",
  },
};

function emptyColumnFilters(): Record<LedgerFilterKey, ColumnFilter> {
  return LEDGER_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<LedgerFilterKey, ColumnFilter>,
  );
}

interface DepositLedgerDisplayRow {
  id: string;
  isOpening: boolean;
  docDate: string | null;
  receiptNo: string;
  paymentNo: string;
  receiptId: string | null;
  paymentId: string | null;
  /** Raw movement number — the invoice code on POS_INVOICE rows. */
  documentNumber: string;
  source: DepositMovementSource | null;
  accountNo: string;
  description: string;
  amountIn: number;
  amountOut: number;
  runningBalance: number;
  counterparty: string;
  staff: string;
}

function toNumber(value: string | null | undefined): number {
  return Number(value) || 0;
}

function toDisplayRow(row: DepositLedgerRow): DepositLedgerDisplayRow {
  return {
    id: row.id,
    isOpening: false,
    docDate: row.docDate,
    receiptNo: row.receiptNo ?? "",
    paymentNo: row.paymentNo ?? "",
    receiptId: row.receiptId ?? null,
    paymentId: row.paymentId ?? null,
    documentNumber: row.documentNumber ?? "",
    source: row.source ?? null,
    accountNo: row.depositAccountNo,
    description: row.description ?? "",
    amountIn: toNumber(row.amountIn),
    amountOut: toNumber(row.amountOut),
    runningBalance: toNumber(row.runningBalance),
    counterparty: row.counterpartyName ?? "",
    staff: row.staffName ?? "",
  };
}

function buildOpeningRow(
  openingBalance: string,
  isAllAccounts: boolean,
): DepositLedgerDisplayRow {
  return {
    id: "opening",
    isOpening: true,
    docDate: null,
    receiptNo: "",
    paymentNo: "",
    receiptId: null,
    paymentId: null,
    documentNumber: "",
    source: null,
    accountNo: "",
    description: isAllAccounts
      ? "Số dư đầu kỳ (tất cả tài khoản)"
      : "Số dư đầu kỳ",
    amountIn: 0,
    amountOut: 0,
    runningBalance: toNumber(openingBalance),
    counterparty: "",
    staff: "",
  };
}

export function LedgerDepositPage() {
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [accountId, setAccountId] = useState("");
  const [columnFilters, setColumnFilters] =
    useState<Record<LedgerFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [exporting, setExporting] = useState(false);
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedInvoiceCode, setSelectedInvoiceCode] = useState<string | null>(null);

  const { data: accounts = [] } = useDepositAccounts();
  const { data: receiptDetail } = useBankReceipt(selectedReceiptId ?? undefined, Boolean(selectedReceiptId));
  const { data: paymentDetail } = useBankPayment(selectedPaymentId ?? undefined, Boolean(selectedPaymentId));
  const { data: invoiceDetail } = useInvoiceDetailByCode(selectedInvoiceCode ?? undefined);

  const accountOptions = useMemo<SingleSelectOption[]>(
    () => [
      { value: "", label: "Tất cả" },
      ...accounts.map((a) => ({
        value: a.id,
        label: a.accountNo ? `${a.name} (${a.accountNo})` : a.name,
      })),
    ],
    [accounts],
  );

  const ledgerParams = useMemo(
    () => ({
      depositAccountId: accountId || undefined,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
    }),
    [accountId, appliedPeriod],
  );

  // Debounced so typing in a column filter settles into one request.
  const debouncedFilters = useDebouncedValue(columnFilters, 300);

  const searchBody = useMemo(() => {
    const merged: Record<string, ColumnFilter> = {
      ...debouncedFilters,
      docDate: {
        ...debouncedFilters.docDate,
        from: debouncedFilters.docDate.from || appliedPeriod.from,
        to: debouncedFilters.docDate.to || appliedPeriod.to,
      },
      // Both voucher-number columns render document_number; whichever the user
      // filled wins (no row carries both a receipt and a payment number).
      documentNumber: debouncedFilters.receiptNo.value
        ? debouncedFilters.receiptNo
        : debouncedFilters.paymentNo,
    };
    return {
      ...buildV2Body(LEDGER_SEARCH, merged, pagination.page, pagination.pageSize),
      ...(accountId ? { depositAccountId: accountId } : {}),
    };
  }, [debouncedFilters, appliedPeriod, pagination, accountId]);

  const canQuery = Boolean(appliedPeriod.from) && Boolean(appliedPeriod.to);
  const ledger = useDepositLedgerSearch(searchBody, canQuery);
  const data = ledger.data;
  const balances = selectDepositBalances(data);

  // Opening-balance row is shown only on page 1 and is EXCLUDED from `total`.
  const displayRows = useMemo<DepositLedgerDisplayRow[]>(() => {
    if (!data) return [];
    const movement = data.rows.map(toDisplayRow);
    return pagination.page === 1
      ? [buildOpeningRow(data.openingBalance, !accountId), ...movement]
      : movement;
  }, [data, pagination.page, accountId]);

  /**
   * A ledger row is a movement. Vouchers open by their resolved id; POS_INVOICE
   * rows have no voucher, so they open the invoice by its code — which is what
   * `documentNumber` holds for them.
   */
  const handleRowClick = useCallback((row: DepositLedgerDisplayRow) => {
    if (row.isOpening) return;
    if (row.receiptId) setSelectedReceiptId(row.receiptId);
    else if (row.paymentId) setSelectedPaymentId(row.paymentId);
    else if (row.source === DepositMovementSource.POS_INVOICE && row.documentNumber) {
      setSelectedInvoiceCode(row.documentNumber);
    }
  }, []);

  /** True when the row has something to open — drives the link affordance. */
  const isOpenable = useCallback(
    (row: DepositLedgerDisplayRow) =>
      !row.isOpening &&
      Boolean(
        row.receiptId ||
          row.paymentId ||
          (row.source === DepositMovementSource.POS_INVOICE && row.documentNumber),
      ),
    [],
  );

  const columns = useMemo<TableColumn<DepositLedgerDisplayRow>[]>(
    () => [
      {
        key: "docDate",
        label: "Ngày chứng từ",
        width: 110,
        filterKind: "date-range",
        render: (r) =>
          r.docDate
            ? new Date(r.docDate).toLocaleDateString("vi-VN", VI_DATE)
            : "",
      },
      {
        key: "receiptNo",
        label: "Số phiếu thu",
        width: 120,
        render: (r) =>
          r.receiptNo ? (
            <VoucherLink
              code={r.receiptNo}
              clickable={isOpenable(r)}
              onClick={() => handleRowClick(r)}
            />
          ) : (
            ""
          ),
      },
      {
        key: "paymentNo",
        label: "Số phiếu chi",
        width: 120,
        render: (r) =>
          r.paymentNo ? (
            <VoucherLink
              code={r.paymentNo}
              clickable={isOpenable(r)}
              onClick={() => handleRowClick(r)}
            />
          ) : (
            ""
          ),
      },
      {
        key: "accountNo",
        label: "Số tài khoản",
        width: 140,
        render: (r) => r.accountNo,
      },
      {
        key: "description",
        label: "Diễn giải",
        width: 220,
        render: (r) => (
          <span className={r.isOpening ? "font-semibold" : undefined}>
            {r.description}
          </span>
        ),
      },
      {
        key: "amountIn",
        label: "Thu",
        width: 120,
        filterKind: "number-range",
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => (r.amountIn > 0 ? formatMoneyInteger(r.amountIn) : ""),
      },
      {
        key: "amountOut",
        label: "Chi",
        width: 120,
        filterKind: "number-range",
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => (r.amountOut > 0 ? formatMoneyInteger(r.amountOut) : ""),
      },
      {
        key: "runningBalance",
        label: "Số tiền còn lại",
        width: 140,
        // Computed per page from the ordered stream — not a filterable value.
        filterKind: "none",
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => formatMoneyInteger(r.runningBalance),
      },
      {
        key: "counterparty",
        label: "Đối tượng",
        width: 150,
        render: (r) => r.counterparty,
      },
      {
        key: "staff",
        label: "Nhân viên",
        width: 140,
        render: (r) => r.staff,
      },
    ],
    [isOpenable, handleRowClick],
  );

  // Any filter change resets to page 1 — a narrowed result set must not leave
  // the grid stranded on a page that no longer exists.
  const patchFilter = useCallback((key: string, patch: Partial<ColumnFilter>) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key as LedgerFilterKey]: { ...prev[key as LedgerFilterKey], ...patch },
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

  const effectiveColumns = useMemo(() => {
    const footerMap: Record<string, ReactNode> = {
      description: <span className="font-semibold">Tổng</span>,
      amountIn: <span>{formatMoneyInteger(toNumber(data?.totalIn))}</span>,
      amountOut: <span>{formatMoneyInteger(toNumber(data?.totalOut))}</span>,
    };
    return columns.map((c) => ({ ...c, footer: footerMap[c.key] ?? null }));
  }, [columns, data]);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPagination((p) => ({ ...p, page: 1 }));
    toast.success("Đã nạp dữ liệu.");
  }, [period]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDepositLedgerExport({
        depositAccountId: accountId || undefined,
        dateFrom: appliedPeriod.from,
        dateTo: appliedPeriod.to,
      });
    } catch {
      toast.error("Xuất khẩu thất bại.");
    } finally {
      setExporting(false);
    }
  }, [accountId, appliedPeriod]);


  return (
    <DocumentListShell
      title="Sổ chi tiết tiền gửi"
      tabs={<DepositTabBar activeId={DepositTabIdEnum.LEDGER} />}
      filters={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Tài khoản tiền gửi
              </span>
              <SingleSelect
                options={accountOptions}
                value={accountId}
                onValueChange={setAccountId}
                placeholder="Chọn tài khoản"
                className="w-64"
              />
            </div>
            <PeriodFilter
              value={period}
              onChange={setPeriod}
              onApply={handleApply}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <CloudUpload className="mr-1 h-4 w-4" /> Xuất khẩu
          </Button>
        </div>
      }
      pagination={
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={data?.total ?? 0}
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
        <div className="flex min-h-0 flex-1 flex-col">
          <BaseDataTable
            className="min-h-0 flex-1"
            scrollContainerClassName="min-h-[280px] flex-1"
            columns={effectiveColumns}
            rows={displayRows}
            loading={ledger.isLoading}
            emptyLabel="Không có phát sinh trong kỳ."
            getRowKey={(r) => r.id}
            onRowClick={handleRowClick}
            columnFilterControl={columnFilterControl}
          />
          {data && (
            <div className="flex items-center justify-end gap-6 border-t bg-muted/50 px-4 py-2 text-sm font-semibold">
              <span>
                Số dư cuối kỳ: {formatMoneyInteger(toNumber(data.closingBalance))}
              </span>
              {balances && (
                <>
                  <span>Số dư sổ sách: {formatMoneyInteger(balances.bookBalance)}</span>
                  <span className="flex items-center gap-1">
                    Số dư khả dụng: {formatMoneyInteger(balances.availableBalance)}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground"
                            aria-label="Giải thích số dư khả dụng"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs font-normal">
                          Số dư sổ sách gồm cả tiền chưa về tài khoản (đang chờ đối tác thanh
                          toán ghi có, T+n). Số dư khả dụng chỉ tính phần tiền đã thực sự về —
                          chênh lệch hiện tại: {formatMoneyInteger(balances.pendingClearingAmount)}.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <InvoiceDetailDialog
        open={Boolean(selectedInvoiceCode)}
        onOpenChange={(o) => {
          if (!o) setSelectedInvoiceCode(null);
        }}
        detail={invoiceDetail ?? null}
      />

      <DepositReceiptVoucherDialog
        open={Boolean(selectedReceiptId)}
        onOpenChange={(open) => {
          if (!open) setSelectedReceiptId(null);
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={receiptDetail ?? null}
      />
      <DepositPaymentVoucherDialog
        open={Boolean(selectedPaymentId)}
        onOpenChange={(open) => {
          if (!open) setSelectedPaymentId(null);
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={paymentDetail ?? null}
      />
    </DocumentListShell>
  );
}
