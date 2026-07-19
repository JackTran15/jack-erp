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
import { ReconStatus } from "@erp/shared-interfaces";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";
import {
  DEFAULT_COLUMN_FILTER_MODE,
  applyColumnFilter,
  toComparableText,
  type ColumnFilter,
  type ColumnFilterMode,
} from "../../../components/table/pagination.dto";
import { StatusBadge } from "../../../components/status/StatusBadge";
import {
  DepositTabBar,
  DepositTabIdEnum,
} from "../../../components/document/depositTabs";
import { hasPermission } from "../../../lib/permissions";
import { useDepositAccounts } from "../../../hooks/treasury/use-deposit-accounts";
import {
  downloadDepositReconExport,
  useDepositReconList,
  useDepositReconMutations,
} from "../../../hooks/treasury/use-deposit-recon";
import { LEDGER_CASH_VI_DATE } from "../ledger-cash/ledger-cash.constants";
import { DepositReconBatchDialog } from "./DepositReconBatchDialog";
import {
  DEPOSIT_MOVEMENT_TYPE_FILTER_OPTIONS,
  DEPOSIT_MOVEMENT_TYPE_LABEL,
  RECON_STATUS_FILTER_OPTIONS,
  RECON_STATUS_LABEL,
} from "./deposit-recon.labels";
import type { DepositReconMovementRow } from "./deposit-recon.types";

const NUM_CLASS = "text-right tabular-nums";
const UNRECONCILE_PERMISSION = "accounting.deposit_recon.unreconcile";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<ColumnFilter>({
    mode: DEFAULT_COLUMN_FILTER_MODE,
    value: "",
  });
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [unreconcileOpen, setUnreconcileOpen] = useState(false);
  const [unreconcileReason, setUnreconcileReason] = useState("");

  useEffect(() => {
    setSelected(new Set());
  }, [accountId, reconStatus]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

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

  const query = useMemo(
    () => ({
      depositAccountId: accountId || undefined,
      reconStatus,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
      docNumber: appliedDocNumber || undefined,
      page,
      pageSize,
    }),
    [accountId, reconStatus, appliedPeriod, appliedDocNumber, page, pageSize],
  );

  const list = useDepositReconList(query);
  const { reconcile, unreconcile } = useDepositReconMutations();
  const rows = list.data?.data ?? [];

  const filteredRows = useMemo(() => {
    if (!typeFilter.value.trim()) return rows;
    return rows.filter((r) =>
      applyColumnFilter(toComparableText(DEPOSIT_MOVEMENT_TYPE_LABEL[r.type]), typeFilter),
    );
  }, [rows, typeFilter]);

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (allSelected) return new Set();
      const next = new Set(prev);
      filteredRows.forEach((r) => next.add(r.id));
      return next;
    });
  }, [allSelected, filteredRows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const selectedNetTotal = useMemo(
    () => selectedRows.reduce((s, r) => s + Number(r.netAmount), 0),
    [selectedRows],
  );

  const columns = useMemo<TableColumn<DepositReconMovementRow>[]>(
    () => [
      {
        key: "documentNumber",
        label: "Số chứng từ",
        width: 130,
        filterKind: "none",
        render: (r) => r.documentNumber ?? "—",
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
        key: "account",
        label: "Số tài khoản",
        width: 200,
        filterKind: "none",
        render: (r) => {
          const acc = accountsById.get(r.depositAccountId);
          if (!acc) return "—";
          return acc.accountNo ? `${acc.name} (${acc.accountNo})` : acc.name;
        },
      },
      {
        key: "docDate",
        label: "Ngày",
        width: 100,
        filterKind: "none",
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
        filterKind: "none",
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
        filterKind: "none",
        render: (r) => formatMoneyInteger(Number(r.netAmount)),
      },
      {
        key: "feeAmount",
        label: "Phí",
        width: 100,
        headerClassName: "text-right",
        className: NUM_CLASS,
        filterKind: "none",
        render: (r) => formatMoneyInteger(Number(r.feeAmount)),
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 130,
        headerClassName: "text-right",
        className: NUM_CLASS,
        filterKind: "none",
        render: (r) => formatMoneyInteger(Number(r.amount)),
      },
      {
        key: "reconciled",
        label: "Người/Ngày đối chiếu",
        width: 170,
        filterKind: "none",
        render: (r) =>
          r.reconciledBy
            ? `${r.reconciledBy} · ${new Date(r.reconciledAt!).toLocaleString("vi-VN")}`
            : "—",
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 150,
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
    [accountsById],
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
    setSelected(new Set());
  }, [list]);

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadDepositReconExport(query);
    } catch {
      toast.error("Xuất khẩu thất bại.");
    } finally {
      setExporting(false);
    }
  }, [query]);

  const handleUnreconcileConfirm = useCallback(async () => {
    const reason = unreconcileReason.trim();
    if (!reason) {
      toast.error("Nhập lý do hủy đối chiếu.");
      return;
    }
    try {
      await unreconcile.mutateAsync({ movementIds: Array.from(selected), reason });
      toast.success("Đã hủy đối chiếu.");
      setUnreconcileOpen(false);
      setUnreconcileReason("");
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hủy đối chiếu thất bại.");
    }
  }, [unreconcile, unreconcileReason, selected]);

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reconcile",
      label: "Đối chiếu",
      icon: CheckSquare,
      // Đối chiếu khớp với sao kê của MỘT ngân hàng — không hợp lệ ở chế độ "Tất cả"
      // vì các dòng đã chọn có thể thuộc nhiều tài khoản khác nhau.
      disabled: reconStatus !== ReconStatus.CHUA || selected.size === 0 || !accountId,
      tooltip: !accountId ? "Chọn một tài khoản cụ thể để đối chiếu" : undefined,
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
            <span className="font-semibold">{list.data?.rowCount ?? 0}</span>
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
          rows={filteredRows}
          loading={list.isLoading}
          emptyLabel="Không có giao dịch phù hợp."
          getRowKey={(r) => r.id}
          columnFilterControl={{
            filters: { type: typeFilter },
            onModeChange: (_key, mode: ColumnFilterMode) =>
              setTypeFilter((prev) => ({ ...prev, mode })),
            onValueChange: (_key, value) => setTypeFilter((prev) => ({ ...prev, value })),
          }}
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
                onChange={() => toggleOne(r.id)}
                aria-label={`Chọn ${r.documentNumber ?? r.id}`}
              />
            ),
          }}
        />
      </DocumentListShell>

      <DepositReconBatchDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        depositAccountId={accountId}
        movementIds={Array.from(selected)}
        selectedNetTotal={selectedNetTotal}
        reconcile={reconcile}
        onDone={() => setSelected(new Set())}
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
