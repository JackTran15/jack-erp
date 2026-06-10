import { AppModal, formatMoneyInteger } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import {
  listStockSummaryDetails,
  type StockSummaryDetailRow,
} from "../../../api/stock-summary";
import { BaseDataTable, type TableColumn } from "../../../components/table/BaseDataTable";

interface SelectedStockItem {
  id: string;
  code: string;
  name: string;
  storageId: string;
}

interface Props {
  item: SelectedStockItem | null;
  period: { from?: string; to?: string };
  onClose: () => void;
}

const DETAIL_COLUMNS: TableColumn<StockSummaryDetailRow>[] = [
  {
    key: "referenceType",
    label: "Loại chứng từ",
    width: 150,
    render: (row) => row.referenceType,
  },
  {
    key: "referenceId",
    label: "Mã tham chiếu",
    width: 220,
    render: (row) => <span className="font-mono text-xs">{row.referenceId}</span>,
  },
  {
    key: "postedAt",
    label: "Ngày ghi sổ",
    width: 160,
    render: (row) => new Date(row.postedAt).toLocaleString("vi-VN"),
  },
  {
    key: "quantity",
    label: "Số lượng",
    width: 100,
    headerClassName: "text-right",
    className: "text-right tabular-nums",
    render: (row) => row.quantity.toLocaleString("vi-VN"),
  },
  {
    key: "unitCost",
    label: "Đơn giá",
    width: 120,
    headerClassName: "text-right",
    className: "text-right tabular-nums",
    render: (row) => formatMoneyInteger(row.unitCost),
  },
  {
    key: "lineValue",
    label: "Thành tiền",
    width: 130,
    headerClassName: "text-right",
    className: "text-right tabular-nums",
    render: (row) => formatMoneyInteger(row.lineValue),
  },
  {
    key: "notes",
    label: "Ghi chú",
    width: 180,
    render: (row) => row.notes ?? "",
  },
];

export function StockDetailDrawer({ item, period, onClose }: Props) {
  const detailsQuery = useQuery({
    queryKey: [
      "stock-summary",
      "details",
      item?.id,
      item?.storageId,
      period.from,
      period.to,
    ],
    queryFn: () =>
      listStockSummaryDetails({
        itemId: item!.id,
        storageId: item!.storageId,
        startDate: period.from,
        endDate: period.to,
        page: 1,
        pageSize: 200,
      }),
    enabled: Boolean(item),
  });

  return (
    <AppModal
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Thẻ kho: ${item?.code ?? ""} - ${item?.name ?? ""}`}
      defaultWidth={900}
      defaultHeight={600}
    >
      <div className="pt-2">
        <BaseDataTable
          columns={DETAIL_COLUMNS}
          rows={detailsQuery.data?.data ?? []}
          loading={detailsQuery.isLoading}
          emptyLabel={
            detailsQuery.isError
              ? "Không thể tải chi tiết tồn kho."
              : "Không có phát sinh tồn kho trong kỳ này."
          }
          getRowKey={(row, index) =>
            `${row.referenceType}:${row.referenceId}:${row.postedAt}:${index}`
          }
        />
      </div>
    </AppModal>
  );
}
