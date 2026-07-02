import { ImportRowStatus } from "@erp/shared-interfaces";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../components/status/StatusBadge";
import { downloadLocationErrorRowsExcel } from "./import-location.api";
import type { ImportJob, LocationImportJobRow } from "./import-location.types";

interface ReviewRow extends LocationImportJobRow {
  isError: boolean;
  statusLabel: string;
}

interface Props {
  job: ImportJob;
  rows: LocationImportJobRow[];
  rowsTruncated?: boolean;
}

function buildColumns(): TableColumn<ReviewRow>[] {
  return [
    {
      key: "code",
      label: "Mã vị trí",
      width: 140,
      render: (r) => r.rawData.LocationCode,
    },
    {
      key: "name",
      label: "Tên vị trí",
      width: 180,
      render: (r) => r.rawData.LocationName,
    },
    {
      key: "storage",
      label: "Thuộc kho",
      width: 180,
      render: (r) => r.rawData.StorageName,
    },
    {
      key: "description",
      label: "Mô tả",
      width: 180,
      render: (r) => r.rawData.Description ?? "",
    },
    {
      key: "status",
      label: "Tình trạng",
      width: 300,
      render: (r) => (
        <StatusBadge variant={r.isError ? "danger" : "success"}>
          {r.statusLabel}
        </StatusBadge>
      ),
    },
  ];
}

export function ImportStepDataReviewLocation({
  job,
  rows,
  rowsTruncated,
}: Props) {
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);

  const reviewRows: ReviewRow[] = rows.map((row) => {
    const isError = row.status === ImportRowStatus.ERROR;
    return {
      ...row,
      isError,
      statusLabel: isError
        ? (row.errorMessages?.map((e) => e.message).join(" ") ?? "Không hợp lệ")
        : "Hợp lệ",
    };
  });

  const columns = buildColumns();
  const validCount = job.validRows ?? 0;
  const errorCount = job.errorRows ?? 0;
  const total = job.totalRows ?? rows.length;

  const handleDownloadErrors = async () => {
    try {
      setIsDownloadingErrors(true);
      await downloadLocationErrorRowsExcel(job.id);
    } catch {
      toast.error("Không thể tải file lỗi. Vui lòng thử lại.");
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {rowsTruncated ? (
        <p className="text-sm text-muted-foreground">
          Hiển thị tối đa 200 dòng mẫu trong tổng{" "}
          {total.toLocaleString("vi-VN")} dòng.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <span>
          Tổng số <strong className="font-semibold">{total}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
          Hợp lệ{" "}
          <strong className="font-semibold text-green-700">{validCount}</strong>
        </span>
        {errorCount > 0 ? (
          <span>
            Không hợp lệ{" "}
            <strong className="font-semibold text-destructive">
              {errorCount}
            </strong>{" "}
            (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[#2563eb] hover:underline disabled:opacity-60"
              disabled={isDownloadingErrors}
              onClick={() => void handleDownloadErrors()}
            >
              {isDownloadingErrors ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Tải về
            </button>
            )
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded border border-gray-200">
        <BaseDataTable
          columns={columns}
          rows={reviewRows}
          loading={false}
          emptyLabel="Không có dòng dữ liệu."
          getRowKey={(row) => row.id}
          scrollContainerClassName="max-h-[min(52vh,480px)]"
          className="min-w-full [&_thead]:bg-gray-100 [&_thead_th]:font-semibold [&_tbody_tr:nth-child(even)]:bg-gray-50/80"
        />
      </div>
    </div>
  );
}
