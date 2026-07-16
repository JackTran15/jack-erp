import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { DocumentListShell, PageToolbar, formatMoneyInteger, type ToolbarItem } from "@erp/ui";
import { BaseDataTable, type TableColumn } from "../../../components/table/BaseDataTable";
import { useDepositInTransit, type InTransitRow } from "../../../hooks/treasury/use-deposit-in-transit";

const NUM_CLASS = "text-right tabular-nums";

export function DepositInTransitPage() {
  const report = useDepositInTransit();
  const rows = report.data?.data ?? [];

  const columns = useMemo<TableColumn<InTransitRow>[]>(
    () => [
      {
        key: "fromBranch",
        label: "CN nguồn",
        width: 160,
        render: (r) => r.fromBranchName ?? r.fromBranchId,
      },
      {
        key: "toBranch",
        label: "CN đích",
        width: 160,
        render: (r) => r.toBranchName ?? r.toBranchId,
      },
      {
        key: "fromAccount",
        label: "Tài khoản nguồn",
        width: 180,
        render: (r) => r.fromAccountName ?? "—",
      },
      {
        key: "toAccount",
        label: "Tài khoản đích",
        width: 180,
        render: (r) => r.toAccountName ?? "—",
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 140,
        headerClassName: "text-right",
        className: NUM_CLASS,
        footer: <span className="font-semibold">{formatMoneyInteger(Number(report.data?.total ?? 0))}</span>,
        render: (r) => formatMoneyInteger(Number(r.amount)),
      },
      {
        key: "initiatedAt",
        label: "Ngày khởi tạo",
        width: 150,
        render: (r) => new Date(r.initiatedAt).toLocaleString("vi-VN"),
      },
      {
        key: "daysInTransit",
        label: "Số ngày treo",
        width: 140,
        headerClassName: "text-right",
        className: NUM_CLASS,
        render: (r) => (
          <span
            className={
              r.isOverdue
                ? "flex items-center justify-end gap-1 font-semibold text-amber-600"
                : undefined
            }
          >
            {r.isOverdue ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
            {r.daysInTransit}
          </span>
        ),
      },
    ],
    [report.data?.total],
  );

  const toolbarItems: ToolbarItem[] = [
    {
      id: "reload",
      label: "Nạp lại",
      icon: RefreshCw,
      onClick: () => void report.refetch(),
    },
  ];

  return (
    <DocumentListShell
      title="Tiền đang chuyển"
      toolbar={<PageToolbar items={toolbarItems} tone="primary" />}
      filters={
        report.data ? (
          <p className="text-sm text-muted-foreground">
            Ngưỡng cảnh báo quá hạn: <strong>{report.data.staleDays} ngày</strong> — các dòng quá
            hạn được đánh dấu <AlertTriangle className="inline h-3.5 w-3.5 text-amber-600" />.
          </p>
        ) : null
      }
    >
      <BaseDataTable
        columns={columns}
        rows={rows}
        loading={report.isLoading}
        emptyLabel="Không có khoản tiền nào đang chuyển."
        getRowKey={(r) => r.id}
      />
    </DocumentListShell>
  );
}
