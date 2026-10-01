import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@erp/ui";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import { BaseDataTable, type TableColumn } from "../../../components/table/BaseDataTable";
import { PaginationControls } from "../../../components/table/PaginationControls";

interface PointHistoryItem {
  id: string;
  createdAt: string;
  type: "earn" | "redeem" | "adjust";
  delta: number;
  invoiceId: string | null;
  invoiceCode: string | null;
  note: string | null;
  createdByName: string | null;
}

interface PointHistoryPage {
  data: PointHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

interface Props {
  customerId: string;
}

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<PointHistoryItem["type"], string> = {
  earn: "Tích điểm",
  redeem: "Dùng điểm",
  adjust: "Điều chỉnh",
};

const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

const columns: TableColumn<PointHistoryItem>[] = [
  { key: "createdAt", label: "Ngày", width: 150, render: (r) => dateTime.format(new Date(r.createdAt)) },
  { key: "type", label: "Loại", width: 120, render: (r) => TYPE_LABELS[r.type] ?? r.type },
  {
    key: "delta",
    label: "Điểm",
    width: 110,
    className: "text-right",
    headerClassName: "text-right",
    render: (r) => (
      <span className={cn("font-medium", r.delta > 0 ? "text-success" : "text-destructive")}>
        {r.delta > 0 ? "+" : ""}
        {r.delta.toLocaleString("vi-VN")}
      </span>
    ),
  },
  { key: "invoiceCode", label: "Hóa đơn", width: 140, render: (r) => r.invoiceCode ?? "" },
  { key: "note", label: "Ghi chú", render: (r) => r.note ?? "" },
  { key: "createdByName", label: "Người thực hiện", width: 180, render: (r) => r.createdByName ?? "" },
];

/** Tab "Lịch sử điểm": sổ cái điểm của khách, mới nhất trước. Chỉ mount khi có quyền xem. */
export function PointHistoryTab({ customerId }: Props) {
  const [page, setPage] = useState(1);

  const historyQuery = useQuery({
    queryKey: ["customer-point-history", customerId, page],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PointHistoryPage>("/customers/{id}/point-history", {
          params: { path: { id: customerId }, query: { page, limit: PAGE_SIZE } },
        }),
      ),
  });

  return (
    <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
      <nav aria-label="Tab khách hàng" className="mb-3 flex gap-6">
        <span
          role="tab"
          aria-selected="true"
          className="inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold text-foreground"
        >
          Lịch sử điểm
        </span>
      </nav>
      {historyQuery.isError ? (
        <p className="text-sm text-destructive">Không tải được lịch sử điểm.</p>
      ) : (
        <>
          <BaseDataTable
            columns={columns}
            rows={historyQuery.data?.data ?? []}
            loading={historyQuery.isPending}
            emptyLabel="Chưa có lịch sử điểm."
            getRowKey={(r) => r.id}
            className="max-h-[480px]"
          />
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            total={historyQuery.data?.total ?? 0}
            onPageChange={setPage}
            onRefresh={() => void historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          />
        </>
      )}
    </div>
  );
}
