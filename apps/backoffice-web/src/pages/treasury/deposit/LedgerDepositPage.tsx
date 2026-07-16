import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { DepositLedgerRow } from "@erp/shared-interfaces";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";
import { DEFAULT_PAGINATION } from "../../../components/table/pagination.dto";
import { useDepositAccounts } from "../../../hooks/treasury/use-deposit-accounts";
import { selectDepositBalances } from "../../../hooks/treasury/use-deposit-balance";
import {
  downloadDepositLedgerExport,
  useDepositLedger,
} from "../../../hooks/treasury/use-deposit-ledger";

const VI_DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const NUM_CLASS = "text-right tabular-nums";

interface DepositLedgerDisplayRow {
  id: string;
  isOpening: boolean;
  docDate: string | null;
  receiptNo: string;
  paymentNo: string;
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
    accountNo: row.depositAccountNo,
    description: row.description ?? "",
    amountIn: toNumber(row.amountIn),
    amountOut: toNumber(row.amountOut),
    runningBalance: toNumber(row.runningBalance),
    counterparty: row.counterpartyName ?? "",
    staff: row.staffName ?? "",
  };
}

function buildOpeningRow(openingBalance: string): DepositLedgerDisplayRow {
  return {
    id: "opening",
    isOpening: true,
    docDate: null,
    receiptNo: "",
    paymentNo: "",
    accountNo: "",
    description: "Số dư đầu kỳ",
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
  const [exporting, setExporting] = useState(false);

  const { data: accounts = [] } = useDepositAccounts();

  const accountOptions = useMemo<SingleSelectOption[]>(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.accountNo ? `${a.name} (${a.accountNo})` : a.name,
      })),
    [accounts],
  );

  // Default to the branch's default deposit account (or the first) once loaded.
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      const preferred = accounts.find((a) => a.isDefault) ?? accounts[0];
      setAccountId(preferred.id);
    }
  }, [accounts, accountId]);

  const ledgerParams = useMemo(
    () => ({
      depositAccountId: accountId || undefined,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
    }),
    [accountId, appliedPeriod],
  );

  const ledger = useDepositLedger(
    ledgerParams,
    pagination.page,
    pagination.pageSize,
  );
  const data = ledger.data;
  const balances = selectDepositBalances(data);

  // Opening-balance row is shown only on page 1 and is EXCLUDED from `total`.
  const displayRows = useMemo<DepositLedgerDisplayRow[]>(() => {
    if (!data) return [];
    const movement = data.rows.map(toDisplayRow);
    return pagination.page === 1
      ? [buildOpeningRow(data.openingBalance), ...movement]
      : movement;
  }, [data, pagination.page]);

  const columns = useMemo<TableColumn<DepositLedgerDisplayRow>[]>(
    () => [
      {
        key: "docDate",
        label: "Ngày chứng từ",
        width: 110,
        render: (r) =>
          r.docDate
            ? new Date(r.docDate).toLocaleDateString("vi-VN", VI_DATE)
            : "",
      },
      { key: "receiptNo", label: "Số phiếu thu", width: 120, render: (r) => r.receiptNo },
      { key: "paymentNo", label: "Số phiếu chi", width: 120, render: (r) => r.paymentNo },
      { key: "accountNo", label: "Số tài khoản", width: 140, render: (r) => r.accountNo },
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
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => (r.amountIn > 0 ? formatMoneyInteger(r.amountIn) : ""),
      },
      {
        key: "amountOut",
        label: "Chi",
        width: 120,
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => (r.amountOut > 0 ? formatMoneyInteger(r.amountOut) : ""),
      },
      {
        key: "runningBalance",
        label: "Số tiền còn lại",
        width: 140,
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => formatMoneyInteger(r.runningBalance),
      },
      { key: "counterparty", label: "Đối tượng", width: 150, render: (r) => r.counterparty },
      { key: "staff", label: "Nhân viên", width: 140, render: (r) => r.staff },
    ],
    [],
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
    if (!accountId) {
      toast.info("Vui lòng chọn tài khoản tiền gửi.");
      return;
    }
    setExporting(true);
    try {
      await downloadDepositLedgerExport({
        depositAccountId: accountId,
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
      title="Tiền gửi"
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
    </DocumentListShell>
  );
}
