import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../../../../lib/api-axios";
import type {
  StockTakeImportCommitResponse,
  StockTakeImportValidateResponse,
} from "./import-stock-take.types";

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function validateStockTakeImport(
  target: {
    stockTakeId?: string;
    storageId: string;
    countByValue: boolean;
  },
  file: File,
): Promise<StockTakeImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<StockTakeImportValidateResponse>(
    "/inventory/imports/stock-takes/validate",
    form,
    {
      params: target.stockTakeId
        ? { stockTakeId: target.stockTakeId }
        : {
            storageId: target.storageId,
            countByValue: target.countByValue,
          },
    },
  );
  return data;
}

export async function commitStockTakeImport(
  jobId: string,
): Promise<StockTakeImportCommitResponse> {
  const { data } = await apiClient.post<StockTakeImportCommitResponse>(
    "/inventory/imports/stock-takes/commit",
    undefined,
    { params: { jobId } },
  );
  return data;
}

export async function cancelStockTakeImport(jobId: string): Promise<void> {
  await apiClient.delete(
    `/inventory/imports/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function loadValidStockTakeImportRows(
  jobId: string,
): Promise<StockTakeImportValidateResponse["rows"]> {
  const { data } = await apiClient.get<{
    data: StockTakeImportValidateResponse["rows"];
    total: number;
  }>(`/inventory/imports/jobs/${encodeURIComponent(jobId)}/rows`, {
    params: { page: 1, pageSize: 5000, status: "VALID" },
  });
  return data.data;
}

export async function downloadStockTakeImportErrors(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "dong-kiem-ke-loi.xlsx");
}

export async function downloadStockTakeTemplate(
  countByValue: boolean,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/stock-takes/import-template.xlsx",
    {
      params: { countByValue },
      responseType: "blob",
    },
  );
  triggerBlobDownload(data, "DanhSachHangHoaKiemKe.xlsx");
}

export function useValidateStockTakeImport() {
  return useMutation({
    mutationFn: ({
      target,
      file,
    }: {
      target: {
        stockTakeId?: string;
        storageId: string;
        countByValue: boolean;
      };
      file: File;
    }) => validateStockTakeImport(target, file),
  });
}

export function useCommitStockTakeImport() {
  return useMutation({
    mutationFn: (jobId: string) => commitStockTakeImport(jobId),
  });
}
