import { useEffect, useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import {
  AppModal,
  Button,
  DateTimeField,
  FormField,
  MoneyInput,
  Textarea,
  formatMoneyInteger,
} from "@erp/ui";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type {
  DepositReconSearchRow,
  ReconcileBody,
  ReconcileGroupResult,
  ReconcileResponse,
} from "./deposit-recon.types";
import { DepositReconBatchStatus } from "./deposit-recon.types";
import { RECON_BATCH_STATUS_LABEL } from "./deposit-recon.labels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Các dòng đang được tick, có thể thuộc nhiều tài khoản tiền gửi. */
  rows: DepositReconSearchRow[];
  reconcile: UseMutationResult<ReconcileResponse, unknown, ReconcileBody>;
  /** Called after the user closes a successful result (clears the page's selection). */
  onDone: () => void;
}

/** Một tài khoản tiền gửi = một lô đối chiếu = một sao kê ngân hàng. */
interface ReconGroup {
  accountId: string;
  label: string;
  movementIds: string[];
  /** Client-side sum of the group's `netAmount` — a live preview only; the
   * authoritative `systemTotalAmount` is always computed and returned by the server. */
  systemTotal: number;
}

interface GroupInput {
  stmtTotalAmount: number | "";
  note: string;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function accountLabel(row: DepositReconSearchRow): string {
  if (!row.depositAccountName) return "Không rõ tài khoản";
  return row.depositAccountNo
    ? `${row.depositAccountName} (${row.depositAccountNo})`
    : row.depositAccountName;
}

export function DepositReconBatchDialog({
  open,
  onOpenChange,
  rows,
  reconcile,
  onDone,
}: Props) {
  const [stmtFromDate, setStmtFromDate] = useState(today());
  const [stmtToDate, setStmtToDate] = useState(today());
  const [inputs, setInputs] = useState<Record<string, GroupInput>>({});
  const [results, setResults] = useState<ReconcileGroupResult[] | null>(null);

  const groups = useMemo<ReconGroup[]>(() => {
    const byAccount = new Map<string, ReconGroup>();
    for (const r of rows) {
      const existing = byAccount.get(r.depositAccountId);
      if (existing) {
        existing.movementIds.push(r.id);
        existing.systemTotal = round2(existing.systemTotal + Number(r.netAmount));
        continue;
      }
      byAccount.set(r.depositAccountId, {
        accountId: r.depositAccountId,
        label: accountLabel(r),
        movementIds: [r.id],
        systemTotal: round2(Number(r.netAmount)),
      });
    }
    return Array.from(byAccount.values());
  }, [rows]);

  // Chỉ reset khi tập tài khoản/số tiền đổi thật, không reset mỗi lần grid render lại.
  const groupsKey = groups.map((g) => `${g.accountId}:${g.systemTotal}`).join("|");

  useEffect(() => {
    if (!open) return;
    setStmtFromDate(today());
    setStmtToDate(today());
    setResults(null);
    setInputs(
      Object.fromEntries(
        groups.map((g) => [g.accountId, { stmtTotalAmount: g.systemTotal, note: "" }]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupsKey]);

  const patchInput = (accountId: string, patch: Partial<GroupInput>) => {
    setInputs((prev) => {
      const current: GroupInput = prev[accountId] ?? { stmtTotalAmount: "", note: "" };
      return { ...prev, [accountId]: { ...current, ...patch } };
    });
  };

  const diffOf = (g: ReconGroup): number => {
    const stmt = inputs[g.accountId]?.stmtTotalAmount;
    if (stmt === "" || stmt === undefined) return 0;
    return round2(Number(stmt) - g.systemTotal);
  };

  const canSubmit =
    groups.length > 0 &&
    groups.every((g) => {
      const input = inputs[g.accountId];
      if (!input || input.stmtTotalAmount === "") return false;
      // BR-REC-02 phía server cũng chặn, đây chỉ là chặn sớm cho người dùng.
      return diffOf(g) === 0 || input.note.trim().length > 0;
    });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const res = await reconcile.mutateAsync({
        stmtFromDate,
        stmtToDate,
        groups: groups.map((g) => {
          const input = inputs[g.accountId];
          return {
            depositAccountId: g.accountId,
            movementIds: g.movementIds,
            stmtTotalAmount: Number(input.stmtTotalAmount),
            note: input.note.trim() || undefined,
          };
        }),
      });
      setResults(res.results);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đối chiếu thất bại.");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (results) onDone();
  };

  if (!open) return null;

  const labelOf = (accountId: string): string =>
    groups.find((g) => g.accountId === accountId)?.label ?? "Không rõ tài khoản";

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
      title="Đối chiếu tiền gửi"
      // bodyStretch mặc định → danh sách tài khoản cuộn trong thân dialog khi chọn nhiều quỹ.
      defaultWidth={560}
      defaultHeight={520}
      minWidth={440}
      minHeight={340}
      footer={
        results ? (
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose}>
              Đóng
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy bỏ
            </Button>
            <Button
              type="button"
              disabled={!canSubmit || reconcile.isPending}
              onClick={() => void handleSubmit()}
            >
              {reconcile.isPending ? "Đang xử lý…" : "Xác nhận đối chiếu"}
            </Button>
          </div>
        )
      }
    >
      {results ? (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <div key={r.batch.id} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                {r.status === DepositReconBatchStatus.RECONCILED ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <TriangleAlert className="h-5 w-5 text-amber-600" />
                )}
                <span className="text-sm font-semibold">
                  {labelOf(r.batch.depositAccountId)}
                </span>
                <span className="ml-auto text-sm">{RECON_BATCH_STATUS_LABEL[r.status]}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Số tiền hệ thống</span>
                <span className="text-right tabular-nums">
                  {formatMoneyInteger(r.systemTotalAmount)}
                </span>
                <span className="text-muted-foreground">Số tiền sao kê</span>
                <span className="text-right tabular-nums">
                  {formatMoneyInteger(Number(r.batch.stmtTotalAmount))}
                </span>
                <span className="text-muted-foreground">Chênh lệch</span>
                <span className="text-right font-semibold tabular-nums">
                  {formatMoneyInteger(r.diffAmount)}
                </span>
              </div>
              {r.proposalId ? (
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                  Đã tạo đề xuất điều chỉnh phí (nháp, mã {r.proposalId}) — cần duyệt riêng ở
                  phiếu chi tiền gửi. Số dư quỹ tiền gửi <strong>chưa</strong> thay đổi.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {rows.length} giao dịch đã chọn thuộc <strong>{groups.length}</strong> tài khoản —
            mỗi tài khoản được đối chiếu thành một lô riêng theo sao kê của ngân hàng đó.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Từ ngày sao kê" required>
              <DateTimeField
                value={stmtFromDate}
                onChange={(e) => setStmtFromDate(e.target.value)}
              />
            </FormField>
            <FormField label="Đến ngày sao kê" required>
              <DateTimeField value={stmtToDate} onChange={(e) => setStmtToDate(e.target.value)} />
            </FormField>
          </div>
          {groups.map((g) => {
            const input = inputs[g.accountId];
            const diff = diffOf(g);
            return (
              <div key={g.accountId} className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.movementIds.length} giao dịch · Hệ thống:{" "}
                    <strong className="tabular-nums">{formatMoneyInteger(g.systemTotal)}</strong>
                  </span>
                </div>
                <FormField label="Tổng tiền theo sao kê" required>
                  <MoneyInput
                    value={input?.stmtTotalAmount ?? ""}
                    onChange={(v) => patchInput(g.accountId, { stmtTotalAmount: v })}
                  />
                </FormField>
                {diff !== 0 ? (
                  <>
                    <p className="text-xs text-amber-600">
                      Chênh lệch dự kiến: {formatMoneyInteger(diff)} — bắt buộc nhập ghi chú
                      trước khi gửi.
                    </p>
                    <FormField label="Ghi chú lệch" required>
                      <Textarea
                        className="min-h-[56px] resize-none"
                        value={input?.note ?? ""}
                        maxLength={1000}
                        placeholder="Bắt buộc khi số tiền sao kê không khớp hệ thống…"
                        onChange={(e) => patchInput(g.accountId, { note: e.target.value })}
                      />
                    </FormField>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </AppModal>
  );
}
