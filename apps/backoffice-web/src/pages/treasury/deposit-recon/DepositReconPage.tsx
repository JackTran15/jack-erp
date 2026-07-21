import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AppModal,
  Button,
  DocumentListShell,
  Input,
  PageToolbar,
  PeriodFilter,
  SingleSelect,
  Textarea,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
  type SingleSelectOption,
  type ToolbarItem,
} from "@erp/ui";
import { AlertTriangle, CheckSquare, CloudUpload, Lock, RefreshCw, Undo2 } from "lucide-react";
import { DepositMovementSource, ReconStatus } from "@erp/shared-interfaces";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../components/table/pagination.dto";
import {
  buildV2Body,
  type V2SearchConfig,
} from "../../../components/crud/crudV2Search";
import { useDebouncedValue } from "../../../lib/use-debounced-value";
import { StatusBadge } from "../../../components/status/StatusBadge";
import {
  DepositTabBar,
  DepositTabIdEnum,
} from "../../../components/document/depositTabs";
import { hasPermission } from "../../../lib/permissions";
import { useBankPayment } from "../../../hooks/treasury/use-bank-payments";
import { useBankReceipt } from "../../../hooks/treasury/use-bank-receipts";
import { useInvoiceDetailByCode } from "../../../hooks/treasury/use-invoice-detail";
import {
  DepositPaymentVoucherDialog,
  DepositReceiptVoucherDialog,
  InvoiceDetailDialog,
  TreasuryVoucherDialogModeEnum,
  VoucherLink,
} from "../documents";
import { useDepositAccounts } from "../../../hooks/treasury/use-deposit-accounts";
import {
  downloadDepositReconExport,
  useDepositReconMutations,
  useDepositReconSearch,
} from "../../../hooks/treasury/use-deposit-recon";
import { LEDGER_CASH_VI_DATE } from "../ledger-cash/ledger-cash.constants";
import { DepositReconBatchDialog } from "./DepositReconBatchDialog";
import {
  DEPOSIT_MOVEMENT_TYPE_FILTER_OPTIONS,
  DEPOSIT_MOVEMENT_TYPE_LABEL,
  RECON_STATUS_FILTER_OPTIONS,
  RECON_STATUS_LABEL,
} from "./deposit-recon.labels";
import type { DepositReconSearchRow } from "./deposit-recon.types";

const NUM_CLASS = "text-right tabular-nums";
const UNRECONCILE_PERMISSION = "accounting.deposit_recon.unreconcile";

/**
 * Column keys are named after the `POST /v2/deposit-recon/search` request fields
 * so `buildV2Body` maps the filter state straight onto the body.
 */
const DEPOSIT_RECON_FILTER_KEYS = [
  "documentNumber",
  "type",
  "accountLabel",
  "docDate",
  "valueDate",
  "netAmount",
  "feeAmount",
  "amount",
  "reconciledBy",
] as const;

type DepositReconFilterKey = (typeof DEPOSIT_RECON_FILTER_KEYS)[number];

const DEPOSIT_RECON_SEARCH: V2SearchConfig = {
  path: "/v2/deposit-recon/search",
  fields: {
    documentNumber: "string",
    type: "enum",
    accountLabel: "string",
    docDate: "date-range",
    valueDate: "date-range",
    netAmount: "compare",
    feeAmount: "compare",
    amount: "compare",
    reconciledBy: "string",
  },
};

function emptyColumnFilters(): Record<DepositReconFilterKey, ColumnFilter> {
  return DEPOSIT_RECON_FILTER_KEYS.reduce(
    (acc, k) => {
      acc[k] = { mode: DEFAULT_COLUMN_FILTER_MODE, value: "" };
      return acc;
    },
    {} as Record<DepositReconFilterKey, ColumnFilter>,
  );
}

function toDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("vi-VN", LEDGER_CASH_VI_DATE);
}

function toTime(value: string): string {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function DepositReconPage() {
  const { data: accounts = [] } = useDepositAccounts();
  // "" = Tất cả quỹ của chi nhánh (mặc định) — BE bỏ qua filter khi param vắng mặt.
  const [accountId, setAccountId] = useState("");
  const [reconStatus, setReconStatus] = useState<ReconStatus>(ReconStatus.CHUA);
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [docNumberDraft, setDocNumberDraft] = useState("");
  const [appliedDocNumber, setAppliedDocNumber] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Giữ nguyên cả row (không chỉ id): cần `depositAccountId` + `netAmount` để nhóm
  // theo tài khoản, kể cả những dòng đã chọn ở trang khác.
  const [selected, setSelected] = useState<Map<string, DepositReconSearchRow>>(
    () => new Map(),
  );
  const [columnFilters, setColumnFilters] =
    useState<Record<DepositReconFilterKey, ColumnFilter>>(emptyColumnFilters);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [unreconcileOpen, setUnreconcileOpen] = useState(false);
  const [unreconcileReason, setUnreconcileReason] = useState("");

  useEffect(() => {
    setSelected(new Map());
  }, [accountId, reconStatus]);

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

  /** v1-shaped query, kept solely for the Excel export endpoint. */
  const exportQuery = useMemo(
    () => ({
      depositAccountId: accountId || undefined,
      reconStatus,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
      docNumber: appliedDocNumber || undefined,
    }),
    [accountId, reconStatus, appliedPeriod, appliedDocNumber],
  );

  // Debounced so typing in a column filter settles into one request.
  const debouncedFilters = useDebouncedValue(columnFilters, 300);

  const searchBody = useMemo(() => {
    const merged: Record<string, ColumnFilter> = {
      ...debouncedFilters,
      // The period filter and the toolbar doc-number input feed the same fields
      // the column cells do; an explicit column value wins.
      docDate: {
        ...debouncedFilters.docDate,
        from: debouncedFilters.docDate.from || appliedPeriod.from,
        to: debouncedFilters.docDate.to || appliedPeriod.to,
      },
      documentNumber: debouncedFilters.documentNumber.value
        ? debouncedFilters.documentNumber
        : { ...debouncedFilters.documentNumber, value: appliedDocNumber },
    };
    return {
      ...buildV2Body(DEPOSIT_RECON_SEARCH, merged, page, pageSize),
      ...(accountId ? { depositAccountId: accountId } : {}),
      reconStatus: { value: reconStatus },
    };
  }, [
    debouncedFilters,
    appliedPeriod,
    appliedDocNumber,
    page,
    pageSize,
    accountId,
    reconStatus,
  ]);

  const list = useDepositReconSearch(searchBody);
  const { reconcile, unreconcile } = useDepositReconMutations();
  const rows = list.data?.data ?? [];

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  // Chỉ đụng tới các dòng của trang hiện tại — lựa chọn ở trang khác giữ nguyên.
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.set(r.id, r));
      return next;
    });
  }, [allSelected, rows]);

  const toggleOne = useCallback((row: DepositReconSearchRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }, []);

  const selectedRows = useMemo(() => Array.from(selected.values()), [selected]);
  const selectedNetTotal = useMemo(
    () => selectedRows.reduce((s, r) => s + Number(r.netAmount), 0),
    [selectedRows],
  );

  /**
   * A recon row is a movement, not a voucher — `r.id` is the movement id. Which
   * document to open therefore comes from the linkage the search endpoint
   * inlines: a bank voucher for MANUAL/TRANSFER rows, the invoice for POS rows.
   * SYSTEM fee legs have neither.
   */
  const [openDoc, setOpenDoc] = useState<
    | { kind: "payment" | "receipt"; id: string }
    | { kind: "invoice"; code: string }
    | null
  >(null);

  const openDocument = useCallback((r: DepositReconSearchRow) => {
    if (r.bankPaymentId) {
      setOpenDoc({ kind: "payment", id: r.bankPaymentId });
      return;
    }
    if (r.bankReceiptId) {
      setOpenDoc({ kind: "receipt", id: r.bankReceiptId });
      return;
    }
    if (r.source === DepositMovementSource.POS_INVOICE && r.documentNumber) {
      setOpenDoc({ kind: "invoice", code: r.documentNumber });
      return;
    }
    toast.info("Giao dịch này không có chứng từ để mở.");
  }, []);

  const { data: openPayment } = useBankPayment(
    openDoc?.kind === "payment" ? openDoc.id : undefined,
  );
  const { data: openReceipt } = useBankReceipt(
    openDoc?.kind === "receipt" ? openDoc.id : undefined,
  );
  const { data: openInvoice } = useInvoiceDetailByCode(
    openDoc?.kind === "invoice" ? openDoc.code : undefined,
  );

  const columns = useMemo<TableColumn<DepositReconSearchRow>[]>(
    () => [
      {
        key: "documentNumber",
        label: "Số chứng từ",
        width: 130,
        render: (r) =>
          r.documentNumber ? (
            <VoucherLink
              code={r.documentNumber}
              clickable
              onClick={() => openDocument(r)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "type",
        label: "Loại giao dịch",
        width: 150,
        filterKind: "select",
        filterOptions: DEPOSIT_MOVEMENT_TYPE_FILTER_OPTIONS,
        render: (r) => DEPOSIT_MOVEMENT_TYPE_LABEL[r.type],
      },
      {
        key: "accountLabel",
        label: "Số tài khoản",
        width: 200,
        render: (r) =>
          r.depositAccountName
            ? r.depositAccountNo
              ? `${r.depositAccountName} (${r.depositAccountNo})`
              : r.depositAccountName
            : "—",
      },
      {
        key: "docDate",
        label: "Ngày",
        width: 100,
        filterKind: "date-range",
        render: (r) => toDate(r.docDate),
      },
      {
        key: "time",
        label: "Giờ",
        width: 80,
        filterKind: "none",
        render: (r) => toTime(r.createdAt),
      },
      {
        key: "valueDate",
        label: "Ngày ghi có",
        width: 110,
        filterKind: "date-range",
        // null = cleared immediately (settlement_days=0) — same day as docDate,
        // not "no data" (see DepositLedgerRow.valueDate).
        render: (r) => toDate(r.valueDate ?? r.docDate),
      },
      {
        key: "netAmount",
        label: "Số tiền thực nhận",
        width: 140,
        headerClassName: "text-right",
        className: NUM_CLASS,
        filterKind: "number-range",
        render: (r) => formatMoneyInteger(Number(r.netAmount)),
      },
      {
        key: "feeAmount",
        label: "Phí",
        width: 100,
        headerClassName: "text-right",
        className: NUM_CLASS,
        filterKind: "number-range",
        render: (r) => formatMoneyInteger(Number(r.feeAmount)),
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 130,
        headerClassName: "text-right",
        className: NUM_CLASS,
        filterKind: "number-range",
        render: (r) => formatMoneyInteger(Number(r.amount)),
      },
      {
        key: "reconciledBy",
        label: "Người/Ngày đối chiếu",
        width: 170,
        render: (r) =>
          r.reconciledByName || r.reconciledBy
            ? `${r.reconciledByName || r.reconciledBy} · ${new Date(r.reconciledAt!).toLocaleString("vi-VN")}`
            : "—",
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 150,
        // The toolbar dropdown owns this filter — a second control would fight it.
        filterKind: "none",
        render: (r) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge variant={r.reconStatus === ReconStatus.CHUA ? "neutral" : r.reconStatus === ReconStatus.DA ? "success" : "warning"}>
              {RECON_STATUS_LABEL[r.reconStatus]}
            </StatusBadge>
            {r.reconStatus !== ReconStatus.CHUA ? (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Đã khóa" />
            ) : null}
          </div>
        ),
      },
    ],
    [openDocument],
  );

  // Any filter change resets to page 1 — a narrowed result set must not leave
  // the grid stranded on a page that no longer exists.
  const patchFilter = useCallback((key: string, patch: Partial<ColumnFilter>) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key as DepositReconFilterKey]: {
        ...prev[key as DepositReconFilterKey],
        ...patch,
      },
    }));
    setPage(1);
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

  const canUnreconcile = hasPermission(UNRECONCILE_PERMISSION);

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setAppliedDocNumber(docNumberDraft);
    setPage(1);
    toast.success("Đã nạp dữ liệu.");
  }, [period, docNumberDraft]);

  const handleReload = useCallback(() => {
    void list.refetch();
    setSelected(new Map());
  }, [list]);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDepositReconExport(exportQuery);
    } catch {
      toast.error("Xuất khẩu thất bại.");
    } finally {
      setExporting(false);
    }
  }, [exportQuery]);

  const handleUnreconcileConfirm = useCallback(async () => {
    const reason = unreconcileReason.trim();
    if (!reason) {
      toast.error("Nhập lý do hủy đối chiếu.");
      return;
    }
    try {
      await unreconcile.mutateAsync({ movementIds: Array.from(selected.keys()), reason });
      toast.success("Đã hủy đối chiếu.");
      setUnreconcileOpen(false);
      setUnreconcileReason("");
      setSelected(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hủy đối chiếu thất bại.");
    }
  }, [unreconcile, unreconcileReason, selected]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reconcile",
      label: "Đối chiếu",
      icon: CheckSquare,
      // Filter tài khoản không còn là điều kiện: các dòng đã chọn được nhóm theo
      // tài khoản trong dialog và mỗi tài khoản thành một lô đối chiếu riêng.
      disabled: reconStatus !== ReconStatus.CHUA || selected.size === 0,
      onClick: () => setBatchDialogOpen(true),
    },
    {
      id: "unreconcile",
      label: "Hủy đối chiếu",
      icon: Undo2,
      disabled: reconStatus === ReconStatus.CHUA || selected.size === 0 || !canUnreconcile,
      tooltip: !canUnreconcile ? "Bạn không có quyền hủy đối chiếu" : undefined,
      onClick: () => {
        setUnreconcileReason("");
        setUnreconcileOpen(true);
      },
    },
    { id: "sep1", type: "separator" },
    {
      id: "export",
      label: "Xuất Excel",
      icon: CloudUpload,
      disabled: exporting,
      onClick: () => void handleExport(),
    },
    {
      id: "reload",
      label: "Nạp lại",
      icon: RefreshCw,
      onClick: handleReload,
    },
  ];

  return (
    <>
      <DocumentListShell
        title="Đối chiếu tiền gửi"
        tabs={<DepositTabBar activeId={DepositTabIdEnum.RECONCILIATION} />}
        toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
        filters={
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Số tài khoản</span>
                <SingleSelect
                  options={accountOptions}
                  value={accountId}
                  onValueChange={setAccountId}
                  placeholder="Chọn tài khoản"
                  className="w-64"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Trạng thái</span>
                <SingleSelect
                  options={RECON_STATUS_FILTER_OPTIONS}
                  value={reconStatus}
                  onValueChange={(v) => setReconStatus(v as ReconStatus)}
                  className="w-48"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Số chứng từ</span>
                <Input
                  value={docNumberDraft}
                  onChange={(e) => setDocNumberDraft(e.target.value)}
                  placeholder="Tìm số chứng từ…"
                  className="h-8 w-48"
                />
              </div>
              <PeriodFilter value={period} onChange={setPeriod} onApply={handleApply} />
            </div>
            {list.data?.hasStaleUnreconciled ? (
              <div className="flex items-center gap-1.5 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Có giao dịch chưa đối chiếu quá hạn trong kỳ đã chọn.
              </div>
            ) : null}
          </div>
        }
        summary={
          <div className="flex items-center justify-end gap-6 px-2">
            {selected.size > 0 ? (
              <span>
                Đã chọn: <strong>{selected.size}</strong> dòng · Tổng đã chọn:{" "}
                <strong>{formatMoneyInteger(selectedNetTotal)}</strong>
              </span>
            ) : null}
            <span className="text-muted-foreground">Số dòng:</span>
            <span className="font-semibold">{list.data?.total ?? 0}</span>
            <span className="text-muted-foreground">Tổng số tiền:</span>
            <span className="text-base font-semibold">
              {formatMoneyInteger(list.data?.totalAmount ?? 0)}
            </span>
          </div>
        }
        pagination={
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        }
      >
        <BaseDataTable
          columns={columns}
          rows={rows}
          loading={list.isLoading}
          emptyLabel="Không có giao dịch phù hợp."
          getRowKey={(r) => r.id}
          columnFilterControl={columnFilterControl}
          leadingColumn={{
            width: 36,
            header: (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Chọn tất cả"
              />
            ),
            cell: (r) => (
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggleOne(r)}
                aria-label={`Chọn ${r.documentNumber ?? r.id}`}
              />
            ),
          }}
        />
      </DocumentListShell>

      <DepositPaymentVoucherDialog
        open={openDoc?.kind === "payment"}
        onOpenChange={(o) => {
          if (!o) setOpenDoc(null);
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={openPayment ?? null}
      />

      <DepositReceiptVoucherDialog
        open={openDoc?.kind === "receipt"}
        onOpenChange={(o) => {
          if (!o) setOpenDoc(null);
        }}
        mode={TreasuryVoucherDialogModeEnum.VIEW}
        initial={openReceipt ?? null}
      />

      <InvoiceDetailDialog
        open={openDoc?.kind === "invoice"}
        onOpenChange={(o) => {
          if (!o) setOpenDoc(null);
        }}
        detail={openInvoice ?? null}
      />

      <DepositReconBatchDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        rows={selectedRows}
        reconcile={reconcile}
        onDone={() => setSelected(new Map())}
      />

      {unreconcileOpen ? (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) {
              setUnreconcileOpen(false);
              setUnreconcileReason("");
            }
          }}
          title="Hủy đối chiếu"
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
                  setUnreconcileOpen(false);
                  setUnreconcileReason("");
                }}
              >
                Quay lại
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={unreconcile.isPending || !unreconcileReason.trim()}
                onClick={() => void handleUnreconcileConfirm()}
              >
                {unreconcile.isPending ? "Đang xử lý…" : "Hủy đối chiếu"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground leading-relaxed">
              {`Hủy đối chiếu ${selected.size} giao dịch đã chọn. Hành động này sẽ mở khóa các dòng để đối chiếu lại.`}
            </p>
            <label className="text-sm font-medium">Lý do hủy</label>
            <Textarea
              className="min-h-[72px] resize-none"
              value={unreconcileReason}
              maxLength={1000}
              placeholder="Nhập lý do hủy đối chiếu…"
              onChange={(e) => setUnreconcileReason(e.target.value)}
            />
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
