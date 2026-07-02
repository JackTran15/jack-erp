import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ImportRowStatus,
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
} from "@erp/shared-interfaces";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { StatusBadge } from "../../../../components/status/StatusBadge";
import { downloadStockTakeImportErrors } from "./import-stock-take.api";
import type {
  StockTakeImportJob,
  StockTakeImportJobRow,
  StockTakeImportReviewRow,
} from "./import-stock-take.types";

interface Props {
  job: StockTakeImportJob;
  rows: StockTakeImportJobRow[];
  countByValue: boolean;
  rowsTruncated?: boolean;
}

const RAW_KEYS = {
  sku: "Mã SKU",
  location: "Vị trí",
  countedQty: "Số lượng kiểm kê",
  countedValue: "Giá trị kiểm kê",
  reason: "Nguyên nhân",
} as const;

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function displayNumber(value: unknown): string {
  const raw = displayValue(value).trim();
  if (!raw) return "";
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue)
    ? numberValue.toLocaleString("vi-VN")
    : raw;
}

function toReviewRows(
  rows: StockTakeImportJobRow[],
): StockTakeImportReviewRow[] {
  return rows.map((row) => {
    const isError = row.status === ImportRowStatus.ERROR;
    return {
      ...row,
      isError,
      statusLabel: isError
        ? (row.errorMessages?.map((error) => error.message).join(" ") ??
          "Không hợp lệ")
        : "Hợp lệ",
    };
  });
}

function buildColumns(
  countByValue: boolean,
): TableColumn<StockTakeImportReviewRow>[] {
  const columns: TableColumn<StockTakeImportReviewRow>[] = [
    {
      key: "sku",
      label: RAW_KEYS.sku,
      width: 150,
      render: (row) => displayValue(row.rawData[RAW_KEYS.sku]),
    },
    {
      key: "location",
      label: RAW_KEYS.location,
      width: 120,
      render: (row) => displayValue(row.rawData[RAW_KEYS.location]),
    },
    {
      key: "countedQty",
      label: RAW_KEYS.countedQty,
      width: 150,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => displayNumber(row.rawData[RAW_KEYS.countedQty]),
    },
  ];

  if (countByValue) {
    columns.push({
      key: "countedValue",
      label: RAW_KEYS.countedValue,
      width: 160,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => displayNumber(row.rawData[RAW_KEYS.countedValue]),
    });
  }

  columns.push(
    {
      key: "reason",
      label: RAW_KEYS.reason,
      width: 220,
      render: (row) => displayValue(row.rawData[RAW_KEYS.reason]),
    },
    {
      key: "status",
      label: "Tình trạng",
      width: 300,
      render: (row) => (
        <StatusBadge variant={row.isError ? "danger" : "success"}>
          {row.statusLabel}
        </StatusBadge>
      ),
    },
  );

  return columns;
}

export function StockTakeImportStepDataReview({
  job,
  rows,
  countByValue,
  rowsTruncated,
}: Props) {
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
  const reviewRows = useMemo(() => toReviewRows(rows), [rows]);
  const columns = useMemo(() => buildColumns(countByValue), [countByValue]);
  const total = job.totalRows ?? rows.length;
  const validCount = job.validRows ?? 0;
  const errorCount = job.errorRows ?? 0;

  const handleDownloadErrors = async () => {
    try {
      setIsDownloadingErrors(true);
      await downloadStockTakeImportErrors(job.id);
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
