import { apiClient } from "../../../../lib/api-axios";
import {
  ImportDuplicateMode,
  type ImportCommitResponse,
  type ImportValidateResponse,
} from "./import-inventory.types";

export async function validateImportFile(
  file: File,
  duplicateMode: ImportDuplicateMode,
): Promise<ImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<ImportValidateResponse>(
    `/inventory/imports/items/validate?duplicateMode=${duplicateMode}`,
    form,
  );
  return data;
}

export async function commitImportJob(
  jobId: string,
): Promise<ImportCommitResponse> {
  const { data } = await apiClient.post<ImportCommitResponse>(
    `/inventory/imports/items/commit?jobId=${encodeURIComponent(jobId)}`,
  );
  return data;
}

/** Hủy job validate (bước 2 → quay lại): xóa job trên server, cho phép upload lại. */
export async function cancelImportJob(jobId: string): Promise<void> {
  await apiClient.delete(
    `/inventory/imports/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function downloadImportErrorRowsExcel(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hang-hoa-loi-nhap-khau.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadInventoryExcel(
  path: string,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(path, { responseType: "blob" });
  triggerBlobDownload(data, filename);
}

export async function downloadInventoryTemplate(): Promise<void> {
  await downloadInventoryExcel(
    "/inventory/exports/items/template",
    "mau-nhap-hang-hoa.xlsx",
  );
}

export async function downloadInventoryExport(): Promise<void> {
  await downloadInventoryExcel(
    "/inventory/exports/items/excel",
    "danh-sach-hang-hoa.xlsx",
  );
}

export async function downloadInventoryExportSelected(
  itemIds: string[],
  productIds: string[],
): Promise<void> {
  const { data } = await apiClient.post<Blob>(
    "/inventory/exports/items/excel",
    { itemIds, productIds, isGetAll: false },
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "danh-sach-hang-hoa.xlsx");
}
