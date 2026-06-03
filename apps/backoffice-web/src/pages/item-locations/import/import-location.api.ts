import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../../../lib/api-axios";
import {
  ImportDuplicateMode,
  type LocationImportCommitResponse,
  type LocationImportValidateResponse,
} from "./import-location.types";

async function validateLocationImportFile(
  file: File,
  duplicateMode: ImportDuplicateMode,
): Promise<LocationImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<LocationImportValidateResponse>(
    `/inventory/imports/locations/validate?duplicateMode=${duplicateMode}`,
    form,
  );
  return data;
}

async function commitLocationImportJob(
  jobId: string,
): Promise<LocationImportCommitResponse> {
  const { data } = await apiClient.post<LocationImportCommitResponse>(
    `/inventory/imports/locations/commit?jobId=${encodeURIComponent(jobId)}`,
  );
  return data;
}

export function useValidateLocationImport() {
  return useMutation<
    LocationImportValidateResponse,
    Error,
    { file: File; duplicateMode: ImportDuplicateMode }
  >({
    mutationFn: ({ file, duplicateMode }) =>
      validateLocationImportFile(file, duplicateMode),
  });
}

export function useCommitLocationImport() {
  return useMutation<LocationImportCommitResponse, Error, string>({
    mutationFn: (jobId) => commitLocationImportJob(jobId),
  });
}

export function useCancelLocationImport() {
  return useMutation<void, Error, string>({
    mutationFn: async (jobId) => {
      await apiClient.delete(
        `/inventory/imports/jobs/${encodeURIComponent(jobId)}`,
      );
    },
  });
}

export async function downloadLocationErrorRowsExcel(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/locations/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vi-tri-loi-nhap-khau.xlsx";
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

export async function downloadLocationTemplate(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/exports/locations/template",
    {
      responseType: "blob",
    },
  );
  triggerBlobDownload(data, "mau-vi-tri-hang-hoa.xlsx");
}

export async function downloadLocationsExcel(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/exports/locations/excel",
    {
      responseType: "blob",
    },
  );
  triggerBlobDownload(data, "danh-sach-vi-tri-hang-hoa.xlsx");
}
