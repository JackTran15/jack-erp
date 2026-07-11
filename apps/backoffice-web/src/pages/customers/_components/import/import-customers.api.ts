
import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { apiClient } from "../../../../lib/api-axios";
import { triggerBlobDownload } from "../../../../lib/download";
import type {
  CustomerImportCommitResponse,
  ImportValidateResponse,
} from "./import-customers.types";

export async function validateCustomersImportFile(
  file: File,
  duplicateMode: ImportDuplicateMode,
): Promise<ImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<ImportValidateResponse>(
    `/customers/imports/validate?duplicateMode=${duplicateMode}`,
    form,
  );
  return data;
}

export async function commitCustomersImportJob(
  jobId: string,
): Promise<CustomerImportCommitResponse> {
  const { data } = await apiClient.post<CustomerImportCommitResponse>(
    `/customers/imports/commit?jobId=${encodeURIComponent(jobId)}`,
  );
  return data;
}

/** Hủy job validate (bước 2 → quay lại): xóa job trên server, cho phép upload lại. */
export async function cancelCustomersImportJob(jobId: string): Promise<void> {
  await apiClient.delete(
    `/customers/imports/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function downloadCustomersImportErrorRowsExcel(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/customers/imports/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "khach-hang-loi-nhap-khau.xlsx");
}

export async function downloadCustomersTemplate(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/customers/imports/import-template.xls",
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "DanhMucKhachHang.xls");
}

export async function downloadCustomersExport(): Promise<void> {
  const { data } = await apiClient.get<Blob>("/customers/exports/excel", {
    responseType: "blob",
  });
  triggerBlobDownload(data, "danh-muc-khach-hang.xlsx");
}

export async function downloadCustomersExportSelected(
  customerIds: string[],
): Promise<void> {
  const { data } = await apiClient.post<Blob>(
    "/customers/exports/excel",
    { customerIds },
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "danh-muc-khach-hang.xlsx");
}
