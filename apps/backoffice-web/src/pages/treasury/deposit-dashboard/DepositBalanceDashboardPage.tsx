import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { DocumentListShell, PageToolbar, cn, formatMoneyInteger, type ToolbarItem } from "@erp/ui";
import { useDepositDashboard } from "../../../hooks/treasury/use-deposit-dashboard";

interface StatTileProps {
  label: string;
  value: string;
  emphasize?: boolean;
}

function StatTile({ label, value, emphasize }: StatTileProps) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-lg border border-border p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-xl font-semibold tabular-nums", emphasize && "text-primary")}>
        {value}
      </span>
    </div>
  );
}

export function DepositBalanceDashboardPage() {
  const dashboard = useDepositDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (branchId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reload",
      label: "Nạp lại",
      icon: RefreshCw,
      onClick: () => void dashboard.refetch(),
    },
  ];

  return (
    <DocumentListShell
      title="Dashboard số dư toàn hệ thống"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap gap-4">
          <StatTile label="Σ Số dư tài khoản" value={formatMoneyInteger(Number(dashboard.data?.accountsTotal ?? 0))} />
          <StatTile label="Σ Tiền đang chuyển" value={formatMoneyInteger(Number(dashboard.data?.inTransitTotal ?? 0))} />
          <StatTile
            label="Tổng cộng"
            value={formatMoneyInteger(Number(dashboard.data?.grandTotal ?? 0))}
            emphasize
          />
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Chi nhánh / Tài khoản</th>
                <th className="px-2 py-1.5 text-left font-semibold">Loại</th>
                <th className="px-2 py-1.5 text-right font-semibold">Số dư</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.isLoading ? (
                <tr>
                  <td className="px-2 py-4 text-center text-muted-foreground" colSpan={3}>
                    Đang tải…
                  </td>
                </tr>
              ) : (dashboard.data?.branches.length ?? 0) === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-center text-muted-foreground" colSpan={3}>
                    Không có dữ liệu.
                  </td>
                </tr>
              ) : (
                dashboard.data?.branches.map((branch) => (
                  <Fragment key={branch.branchId}>
                    <tr
                      className="cursor-pointer border-t border-border hover:bg-muted/40"
                      onClick={() => toggle(branch.branchId)}
                    >
                      <td className="px-2 py-1.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          {expanded.has(branch.branchId) ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {branch.branchName ?? branch.branchId}
                        </span>
                      </td>
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        {formatMoneyInteger(Number(branch.branchTotal))}
                      </td>
                    </tr>
                    {expanded.has(branch.branchId)
                      ? branch.accounts.map((account) => (
                          <tr key={account.accountId} className="border-t border-border bg-muted/20">
                            <td className="py-1.5 pl-8 pr-2 text-muted-foreground">{account.name}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{account.type}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatMoneyInteger(Number(account.balance))}
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DocumentListShell>
  );
}
