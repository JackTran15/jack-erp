import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  DocumentListShell,
  PageToolbar,
  PeriodFilter,
  resolvePeriodRange,
  type PeriodValue,
  type ToolbarItem,
} from "@erp/ui";
import { Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { ImportableTransferOrderListItem } from "@erp/shared-interfaces";
import { InventoryPageTitle, InventoryTabBar } from "../../components/document/inventoryTabs";
import { BaseDataTable, type TableColumn } from "../../components/table/BaseDataTable";
import { apiClient } from "../../lib/api-axios";
import { getUserFacingApiErrorMessage } from "../../lib/user-facing-api-error";

const moneyFmt = new Intl.NumberFormat("vi-VN");

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}

export function TransferInPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ImportableTransferOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>(() => {
    const range = resolvePeriodRange("this_month");
    return { preset: "this_month", ...range };
  });
  const openReceiptFor = useCallback(
    (row?: ImportableTransferOrderListItem) =>
      navigate("/inventory/purchase-orders", {
        state: row
          ? {
              openTransferInPicker: true,
              transferOrderId: row.id,
              sourceBranchName: row.sourceBranchName,
              exportGoodsIssueDocumentNumber: row.exportGoodsIssueDocumentNumber,
            }
          : { openTransferInPicker: true },
      }),
    [navigate],
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period.from) params.set("from", period.from);
      if (period.to) params.set("to", period.to);
      const { data } = await apiClient.get<ImportableTransferOrderListItem[]>(
        `/inventory/transfer-orders/importable?${params}`,
      );
      setRows(data);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const columns = useMemo<TableColumn<ImportableTransferOrderListItem>[]>(
    () => [
      {
        key: "requestedDate",
        label: "Ngày",
        width: 120,
        render: (row) => formatDate(row.requestedDate),
      },
      {
        key: "exportDocument",
        label: "Phiếu xuất",
        width: 160,
        className: "font-mono",
        render: (row) => row.exportGoodsIssueDocumentNumber ?? "—",
      },
      {
        key: "documentNumber",
        label: "Lệnh điều chuyển",
        width: 170,
        className: "font-mono",
        render: (row) => row.documentNumber,
      },
      {
        key: "sourceBranch",
        label: "Cửa hàng gửi",
        width: 220,
        render: (row) => row.sourceBranchName || row.sourceBranchId,
      },
      {
        key: "totalAmount",
        label: "Tổng tiền",
        width: 140,
        headerClassName: "text-right",
        className: "text-right tabular-nums",
        render: (row) => moneyFmt.format(row.totalAmount),
      },
      {
        key: "status",
        label: "Trạng thái",
        width: 140,
        render: () => "Chờ nhập kho",
      },
    ],
    [],
  );

  const toolbarItems = useMemo<ToolbarItem[]>(
    () => [
      {
        id: "refresh",
        label: loading ? "Đang tải" : "Tải lại",
        icon: RefreshCw,
        disabled: loading,
        onClick: () => void loadRows(),
      },
      {
        id: "receive",
        label: "Lập phiếu nhập",
        icon: Eye,
        onClick: () => openReceiptFor(),
      },
    ],
    [loadRows, loading, openReceiptFor],
  );

  return (
    <DocumentListShell
      title={<InventoryPageTitle>Điều chuyển từ cửa hàng khác</InventoryPageTitle>}
      tabs={<InventoryTabBar activeId="transfer-in" />}
      toolbar={
        <PageToolbar
          items={toolbarItems}
          tone="primary"
          className="m-2 rounded-md"
        />
      }
      filters={
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          onApply={() => void loadRows()}
        />
      }
    >
      <BaseDataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyLabel="Không có phiếu điều chuyển chờ nhập."
        getRowKey={(row) => row.id}
        renderActions={(row) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openReceiptFor(row)}
          >
            Lập phiếu nhập
          </Button>
        )}
      />
    </DocumentListShell>
  );
}
