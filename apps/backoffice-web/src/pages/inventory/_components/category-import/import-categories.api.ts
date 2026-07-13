import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { apiClient } from "../../../../lib/api-axios";
import { triggerBlobDownload } from "../../../../lib/download";
import type { ImportValidateResponse } from "../../../../components/shared/import-wizard/types";

export interface CategoryImportCommitResponse extends ImportValidateResponse {
  categoriesCreated: number;
  categoriesUpdated: number;
}

export async function validateCategoriesImportFile(
  file: File,
  duplicateMode: ImportDuplicateMode,
): Promise<ImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<ImportValidateResponse>(
    `/inventory/imports/item-categories/validate?duplicateMode=${duplicateMode}`,
    form,
  );
  return data;
}

export async function commitCategoriesImportJob(
  jobId: string,
): Promise<CategoryImportCommitResponse> {
  const { data } = await apiClient.post<CategoryImportCommitResponse>(
    `/inventory/imports/item-categories/commit?jobId=${encodeURIComponent(jobId)}`,
  );
  return data;
}

/** Hủy job validate (bước 2 → quay lại): xóa job trên server, cho phép upload lại. */
export async function cancelCategoriesImportJob(jobId: string): Promise<void> {
  await apiClient.delete(
    `/inventory/imports/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function downloadCategoriesImportErrorRowsExcel(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/item-categories/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "nhom-hang-hoa-loi-nhap-khau.xlsx");
}

export async function downloadCategoriesTemplate(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/imports/item-categories/import-template.xls",
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "DanhMucNhomHangHoa.xls");
}

export async function downloadCategoriesExport(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/exports/item-categories/excel",
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "danh-muc-nhom-hang-hoa.xlsx");
}
