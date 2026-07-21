import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AppModal,
  Button,
  DocumentListShell,
  FormField,
  Input,
  SingleSelect,
  Textarea,
  formatMoneyInteger,
  type SingleSelectOption,
} from "@erp/ui";
import { Eye, Lock, LockOpen } from "lucide-react";
import { useMyBranches } from "../../../hooks/iam/useBranches";
import { getActiveBranch } from "../../../lib/auth-storage";
import { hasPermission } from "../../../lib/permissions";
import { useDepositAccounts } from "../../../hooks/treasury/use-deposit-accounts";
import {
  useDepositPeriodLockMutations,
  useDepositPeriodLocks,
} from "../../../hooks/treasury/use-deposit-period-lock";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../components/status/StatusBadge";
import { DEPOSIT_PERIOD_LOCK_STATUS_LABEL } from "./deposit-period-lock.labels";
import {
  DepositPeriodLockStatus,
  type DepositPeriodLock,
} from "./deposit-period-lock.types";

const UNLOCK_PERMISSION = "accounting.deposit_period.unlock";
const STALE_MARKER = "BR-REC-04";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export function DepositPeriodLockPage() {
  const { data: branches = [] } = useMyBranches();
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [staleConfirm, setStaleConfirm] = useState<string | null>(null);
  const [snapshotLock, setSnapshotLock] = useState<DepositPeriodLock | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<DepositPeriodLock | null>(null);
  const [unlockReason, setUnlockReason] = useState("");

  useEffect(() => {
    if (branchId || branches.length === 0) return;
    const active = getActiveBranch();
    const preferred = branches.find((b) => b.id === active) ?? branches[0];
    setBranchId(preferred.id);
  }, [branches, branchId]);

  const { data: accounts = [] } = useDepositAccounts();
  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const branchOptions = useMemo<SingleSelectOption[]>(
    () => branches.map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  const locks = useDepositPeriodLocks(branchId);
  const { lock, unlock } = useDepositPeriodLockMutations();
  const canUnlock = hasPermission(UNLOCK_PERMISSION);

  const handleLock = async (force = false) => {
    if (!branchId) {
      toast.error("Vui lòng chọn chi nhánh.");
      return;
    }
    try {
      await lock.mutateAsync({ branchId, period, force });
      toast.success(`Đã khóa sổ kỳ ${period}.`);
      setStaleConfirm(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Khóa sổ thất bại.";
      if (!force && msg.includes(STALE_MARKER)) {
        setStaleConfirm(msg);
        return;
      }
      toast.error(msg);
    }
  };

  const handleUnlockConfirm = async () => {
    if (!unlockTarget) return;
    const reason = unlockReason.trim();
    if (!reason) {
      toast.error("Nhập lý do mở khóa.");
      return;
    }
    try {
      await unlock.mutateAsync({ id: unlockTarget.id, body: { reason } });
      toast.success("Đã mở khóa kỳ.");
      setUnlockTarget(null);
      setUnlockReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mở khóa thất bại.");
    }
  };

  const columns: TableColumn<DepositPeriodLock>[] = [
    { key: "period", label: "Kỳ", width: 100, render: (r) => r.period },
    {
      key: "status",
      label: "Trạng thái",
      width: 120,
      render: (r) => (
        <StatusBadge variant={r.status === DepositPeriodLockStatus.LOCKED ? "warning" : "neutral"}>
          {DEPOSIT_PERIOD_LOCK_STATUS_LABEL[r.status]}
        </StatusBadge>
      ),
    },
    {
      key: "lockedAt",
      label: "Ngày khóa",
      width: 150,
      render: (r) => new Date(r.lockedAt).toLocaleString("vi-VN"),
    },
    { key: "lockedBy", label: "Người khóa", width: 140, render: (r) => r.lockedBy },
    {
      key: "unlockedAt",
      label: "Ngày mở",
      width: 150,
      render: (r) => (r.unlockedAt ? new Date(r.unlockedAt).toLocaleString("vi-VN") : "—"),
    },
    { key: "unlockReason", label: "Lý do mở", width: 220, render: (r) => r.unlockReason ?? "—" },
  ];

  return (
    <>
      <DocumentListShell
        title="Khóa sổ tiền gửi"
        filters={
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Chi nhánh</span>
              <SingleSelect
                options={branchOptions}
                value={branchId}
                onValueChange={setBranchId}
                placeholder="Chọn chi nhánh"
                className="w-56"
              />
            </div>
            <FormField label="Kỳ (YYYY-MM)">
              <Input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-9 w-40"
              />
            </FormField>
            <Button
              type="button"
              disabled={lock.isPending || !branchId}
              onClick={() => void handleLock(false)}
            >
              <Lock className="mr-1.5 h-4 w-4" />
              {lock.isPending ? "Đang khóa…" : "Khóa kỳ"}
            </Button>
          </div>
        }
      >
        <BaseDataTable
          columns={columns}
          rows={locks.data ?? []}
          loading={locks.isLoading}
          emptyLabel="Chưa có kỳ nào được khóa cho chi nhánh này."
          getRowKey={(r) => r.id}
          renderActions={(r) => (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => setSnapshotLock(r)}>
                <Eye className="mr-1 h-3.5 w-3.5" />
                Snapshot
              </Button>
              {r.status === DepositPeriodLockStatus.LOCKED && canUnlock ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUnlockReason("");
                    setUnlockTarget(r);
                  }}
                >
                  <LockOpen className="mr-1 h-3.5 w-3.5" />
                  Mở khóa
                </Button>
              ) : null}
            </div>
          )}
        />
      </DocumentListShell>

      {staleConfirm ? (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) setStaleConfirm(null);
          }}
          title="Còn giao dịch chưa đối chiếu"
          bodyStretch={false}
          defaultWidth={460}
          defaultHeight={240}
          minWidth={380}
          minHeight={220}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setStaleConfirm(null)}>
                Quay lại
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={lock.isPending}
                onClick={() => void handleLock(true)}
              >
                {lock.isPending ? "Đang khóa…" : "Khóa dù còn chưa đối chiếu"}
              </Button>
            </div>
          }
        >
          <p className="text-muted-foreground leading-relaxed">{staleConfirm}</p>
        </AppModal>
      ) : null}

      {snapshotLock ? (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) setSnapshotLock(null);
          }}
          title={`Snapshot số dư cuối kỳ ${snapshotLock.period}`}
          bodyStretch={false}
          defaultWidth={560}
          defaultHeight={360}
          minWidth={460}
          minHeight={280}
          showFooter={false}
        >
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold">Tài khoản</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Số dư cuối kỳ</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Số dư sổ sách</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Số dư khả dụng</th>
                </tr>
              </thead>
              <tbody>
                {snapshotLock.closingBalanceSnapshot.map((s) => (
                  <tr key={s.depositAccountId} className="border-t border-border">
                    <td className="px-2 py-1.5">
                      {accountsById.get(s.depositAccountId)?.name ?? s.depositAccountId}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoneyInteger(s.closingBalance)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoneyInteger(s.bookBalance)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatMoneyInteger(s.availableBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppModal>
      ) : null}

      {unlockTarget ? (
        <AppModal
          open
          onOpenChange={(open) => {
            if (!open) {
              setUnlockTarget(null);
              setUnlockReason("");
            }
          }}
          title="Mở khóa kỳ"
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
                  setUnlockTarget(null);
                  setUnlockReason("");
                }}
              >
                Quay lại
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={unlock.isPending || !unlockReason.trim()}
                onClick={() => void handleUnlockConfirm()}
              >
                {unlock.isPending ? "Đang xử lý…" : "Mở khóa"}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground leading-relaxed">
              {`Mở khóa kỳ ${unlockTarget.period}. Chỉ Kế toán trưởng mới có thể thực hiện.`}
            </p>
            <label className="text-sm font-medium">Lý do mở khóa</label>
            <Textarea
              className="min-h-[72px] resize-none"
              value={unlockReason}
              maxLength={1000}
              placeholder="Nhập lý do mở khóa kỳ…"
              onChange={(e) => setUnlockReason(e.target.value)}
            />
          </div>
        </AppModal>
      ) : null}
    </>
  );
}
