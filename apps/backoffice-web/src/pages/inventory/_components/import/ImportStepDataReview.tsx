import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT } from "@erp/shared-interfaces";
import { downloadImportErrorRowsExcel } from "./import-inventory.api";
import {
  buildImportReviewPreviewColumns,
  toImportReviewRows,
} from "./import-review-columns";
import type {
  ImportJob,
  ImportJobRow,
  ImportReviewRow,
} from "./import-inventory.types";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";

interface Props {
  job: ImportJob;
  rows: ImportJobRow[];
  rowsTruncated?: boolean;
  /** Override the review grid columns (defaults to the inventory item columns). */
  columns?: TableColumn<ImportReviewRow>[];
  /** Override the error-rows download (defaults to the inventory endpoint). */
  onDownloadErrors?: (jobId: string) => Promise<void>;
}

export function ImportStepDataReview({
  job,
  rows,
  rowsTruncated,
  columns: columnsProp,
  onDownloadErrors,
}: Props) {
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
  const reviewRows = useMemo(() => toImportReviewRows(rows), [rows]);
  const columns = useMemo(
    () => columnsProp ?? buildImportReviewPreviewColumns(),
    [columnsProp],
  );
  const validCount = job.validRows ?? 0;
  const errorCount = job.errorRows ?? 0;
  const total = job.totalRows ?? rows.length;

  const handleDownloadErrors = async () => {
    try {
      setIsDownloadingErrors(true);
      await (onDownloadErrors ?? downloadImportErrorRowsExcel)(job.id);
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
          Hiển thị tối đa {INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT} dòng mẫu (ưu
          tiên dòng lỗi) trong tổng {total.toLocaleString("vi-VN")} dòng. Dữ
          liệu đầy đủ được lưu trên máy chủ cho bước nhập khẩu.
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
