import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../components/status/StatusBadge";
import {
  downloadGoodsReceiptImportErrors,
  getGoodsReceiptImportErrorMessage,
} from "./import-goods-receipt.api";
import {
  ImportRowStatus,
  type GoodsReceiptImportJob,
  type GoodsReceiptImportJobRow,
} from "./import-goods-receipt.types";

interface Props {
  job: GoodsReceiptImportJob;
  rows: GoodsReceiptImportJobRow[];
}

interface ReviewRow extends GoodsReceiptImportJobRow {
  statusLabel: string;
}

const columns: TableColumn<ReviewRow>[] = [
  {
    key: "sku",
    label: "Mã SKU",
    width: 130,
    render: (row) => String(row.rawData["Mã SKU"] ?? ""),
  },
  {
    key: "storage",
    label: "Kho",
    width: 150,
    render: (row) => String(row.rawData["Kho"] ?? ""),
  },
  {
    key: "location",
    label: "Vị trí",
    width: 120,
    render: (row) => String(row.rawData["Vị trí"] ?? ""),
  },
  {
    key: "quantity",
    label: "Số lượng",
    width: 110,
    className: "text-right",
    render: (row) => String(row.rawData["Số lượng"] ?? ""),
  },
  {
    key: "unitPrice",
    label: "Đơn giá",
    width: 130,
    className: "text-right",
    render: (row) =>
      Number(
        row.normalizedData?.unitPrice ?? row.rawData["Đơn giá"] ?? 0,
      ).toLocaleString("vi-VN"),
  },
  {
    key: "status",
    label: "Tình trạng",
    width: 340,
    render: (row) => (
      <StatusBadge
        variant={
          row.status === ImportRowStatus.ERROR
            ? "danger"
            : row.warningMessages?.length
              ? "warning"
              : "success"
        }
      >
        {row.statusLabel}
      </StatusBadge>
    ),
  },
];

export function GoodsReceiptImportStepDataReview({ job, rows }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const reviewRows = useMemo<ReviewRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        statusLabel:
          row.errorMessages?.map((message) => message.message).join("; ") ||
          row.warningMessages?.map((message) => message.message).join("; ") ||
          "Hợp lệ",
      })),
    [rows],
  );

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadGoodsReceiptImportErrors(job.id);
    } catch (error) {
      toast.error(
        await getGoodsReceiptImportErrorMessage(
          error,
          "Không thể tải file lỗi. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span>
          Tổng số <strong>{job.totalRows}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Hợp lệ <strong className="text-green-700">{job.validRows}</strong>
        </span>
        {job.errorRows > 0 ? (
          <span>
            Không hợp lệ{" "}
            <strong className="text-destructive">{job.errorRows}</strong> (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[#2563eb] hover:underline"
              onClick={() => void handleDownload()}
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              Tải về
            </button>
            )
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded border">
        <BaseDataTable
          columns={columns}
          rows={reviewRows}
          loading={false}
          emptyLabel="Không có dòng dữ liệu."
          getRowKey={(row) => row.id}
          scrollContainerClassName="max-h-[min(52vh,480px)]"
          className="min-w-full"
        />
      </div>
    </div>
  );
}
