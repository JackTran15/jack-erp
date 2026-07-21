import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DepositTransferStatus } from "@erp/shared-interfaces";
import {
  Button,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  SingleSelect,
  formatMoneyInteger,
  resolvePeriodRange,
  type PeriodValue,
  type SingleSelectOption,
  type ToolbarItem,
} from "@erp/ui";
import { Check, RefreshCw, X } from "lucide-react";
import { BaseDataTable, type TableColumn } from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";
import { StatusBadge, type StatusBadgeVariant } from "../../../components/status/StatusBadge";
import { useBranches } from "../../../hooks/iam/useBranches";
import { useBranchStore } from "../../../store/common/branch/branch.store";
import { useCashTransfers } from "../../../hooks/treasury/use-cash-transfers";
import { useDepositDashboard } from "../../../hooks/treasury/use-deposit-dashboard";
import { CashTransferFundKind } from "../cash-vouchers.types";
import { ConfirmCashReceiptDialog } from "./ConfirmCashReceiptDialog";
import { CancelCashTransferDialog } from "./CancelCashTransferDialog";
import {
  CASH_TRANSFER_FUND_KIND_LABEL,
  CASH_TRANSFER_STATUS_FILTER_OPTIONS,
  CASH_TRANSFER_STATUS_LABEL,
} from "./cash-transfer.labels";
import { CashTransferDirection, type CashTransfer } from "./cash-transfer.types";

const NUM_CLASS = "text-right tabular-nums";

const STATUS_BADGE_VARIANT: Record<DepositTransferStatus, StatusBadgeVariant> = {
  [DepositTransferStatus.DANG_CHUYEN]: "warning",
  [DepositTransferStatus.HOAN_TAT]: "success",
  [DepositTransferStatus.DA_HUY]: "neutral",
};

const DIRECTION_OPTIONS: SingleSelectOption[] = [
  { value: "", label: "Tất cả" },
  { value: CashTransferDirection.OUT, label: "Đi (nguồn)" },
  { value: CashTransferDirection.IN, label: "Đến (đích)" },
];

const STATUS_OPTIONS: SingleSelectOption[] = [
  { value: "", label: "Tất cả" },
  ...CASH_TRANSFER_STATUS_FILTER_OPTIONS,
];

/**
 * Theo dõi các lần chuyển tiền mặt liên chi nhánh. Không có nút "Thêm mới" —
 * điểm tạo duy nhất là phiếu chi tiền mặt (mục đích "Chuyển tiền đến cửa hàng
 * khác") ở màn Thu, chi tiền mặt.
 */
export function CashTransferListPage() {
  const branchId = useBranchStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const branchNameById = useMemo(
    () => new Map(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const { data: depositDashboard } = useDepositDashboard();
  const depositAccountNameById = useMemo(
    () =>
      new Map(
        (depositDashboard?.branches ?? []).flatMap((b) =>
          b.accounts.map((a) => [a.accountId, a.name] as const),
        ),
      ),
    [depositDashboard],
  );

  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("");
  const [period, setPeriod] = useState<PeriodValue>(() => ({
    preset: "this_month",
    ...resolvePeriodRange("this_month"),
  }));
  const [appliedPeriod, setAppliedPeriod] = useState(period);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [confirmTarget, setConfirmTarget] = useState<CashTransfer | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CashTransfer | null>(null);

  const query = useMemo(
    () => ({
      status: (status || undefined) as DepositTransferStatus | undefined,
      direction: (direction || undefined) as CashTransferDirection | undefined,
      dateFrom: appliedPeriod.from,
      dateTo: appliedPeriod.to,
      page,
      pageSize,
    }),
    [status, direction, appliedPeriod, page, pageSize],
  );

  const list = useCashTransfers(query);
  const rows = list.data?.data ?? [];

  const columns = useMemo<TableColumn<CashTransfer>[]>(
    () => [
      {
        key: "initiatedAt",
        label: "Ngày khởi tạo",
        width: 150,
        render: (r) => new Date(r.initiatedAt).toLocaleString("vi-VN"),
      },
      {
        key: "fromBranch",
        label: "Cửa hàng chuyển",
        width: 160,
        render: (r) => branchNameById.get(r.fromBranchId) ?? r.fromBranchId,
      },
      {
        key: "toBranch",
        label: "Cửa hàng nhận",
        width: 160,
        render: (r) => branchNameById.get(r.toBranchId) ?? r.toBranchId,
      },
      {
        key: "toFundKind",
        label: "Hình thức nhận",
        width: 130,
        render: (r) => CASH_TRANSFER_FUND_KIND_LABEL[r.toFundKind],
      },
      {
        key: "toAccount",
        label: "Tài khoản nhận",
        width: 180,
        render: (r) =>
          r.toFundKind === CashTransferFundKind.DEPOSIT
            ? (depositAccountNameById.get(r.toDepositAccountId ?? "") ??
              r.toDepositAccountId ??
              "—")
            : "Quỹ tiền mặt",
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 140,
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => formatMoneyInteger(Number(r.amount)),
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 130,
        render: (r) => (
          <StatusBadge variant={STATUS_BADGE_VARIANT[r.status]}>
            {CASH_TRANSFER_STATUS_LABEL[r.status]}
          </StatusBadge>
        ),
      },
      {
        key: "note",
        label: "Ghi chú",
        width: 220,
        render: (r) => r.note ?? "—",
      },
    ],
    [branchNameById, depositAccountNameById],
  );

  const handleApply = useCallback(() => {
    setAppliedPeriod(period);
    setPage(1);
    toast.success("Đã nạp dữ liệu.");
  }, [period]);

  const handleReload = useCallback(() => {
    void list.refetch();
  }, [list]);

  const toolbarItems: ToolbarItem[] = [
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
        title="Chuyển tiền mặt liên chi nhánh"
        toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Trạng thái</span>
              <SingleSelect
                options={STATUS_OPTIONS}
                value={status}
                onValueChange={setStatus}
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Chiều</span>
              <SingleSelect
                options={DIRECTION_OPTIONS}
                value={direction}
                onValueChange={setDirection}
                className="w-48"
              />
            </div>
            <PeriodFilter value={period} onChange={setPeriod} onApply={handleApply} />
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
          emptyLabel="Không có khoản chuyển tiền mặt nào phù hợp."
          getRowKey={(r) => r.id}
          renderActions={(r) => {
            const canConfirm =
              r.status === DepositTransferStatus.DANG_CHUYEN && r.toBranchId === branchId;
            const canCancel =
              r.status === DepositTransferStatus.DANG_CHUYEN && r.fromBranchId === branchId;
            if (!canConfirm && !canCancel) return null;
            return (
              <div className="flex items-center gap-1.5">
                {canConfirm ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmTarget(r)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Xác nhận nhận
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelTarget(r)}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Hủy
                  </Button>
                ) : null}
              </div>
            );
          }}
        />
      </DocumentListShell>

      <ConfirmCashReceiptDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        transfer={confirmTarget}
        fromBranchName={
          confirmTarget ? branchNameById.get(confirmTarget.fromBranchId) : undefined
        }
      />

      <CancelCashTransferDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        transfer={cancelTarget}
        toBranchName={
          cancelTarget ? branchNameById.get(cancelTarget.toBranchId) : undefined
        }
      />
    </>
  );
}
