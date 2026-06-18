import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiClient } from "../../../../lib/api-axios";
import type {
  DocumentLineImportJobRow,
  DocumentLineImportKind,
  DocumentLineImportValidateResponse,
} from "./document-line-import.types";

function messageFromApiErrorBody(body: unknown): string {
  if (!body || typeof body !== "object" || !("message" in body)) return "";
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join("; ");
  return typeof message === "string" ? message : "";
}

export async function getDocumentLineImportErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (isAxiosError(error)) {
    const responseData = error.response?.data;
    if (responseData instanceof Blob) {
      try {
        const body = JSON.parse(await responseData.text()) as unknown;
        return messageFromApiErrorBody(body) || fallback;
      } catch {
        return fallback;
      }
    }
    return messageFromApiErrorBody(responseData) || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function validateDocumentLineImport(
  kind: DocumentLineImportKind,
  file: File,
): Promise<DocumentLineImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<DocumentLineImportValidateResponse>(
    `/inventory/imports/${kind}/validate`,
    form,
  );
  return data;
}

export async function cancelDocumentLineImport(
  kind: DocumentLineImportKind,
  jobId: string,
): Promise<void> {
  await apiClient.delete(
    `/inventory/imports/${kind}/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function loadValidDocumentLineImportRows(
  kind: DocumentLineImportKind,
  jobId: string,
): Promise<DocumentLineImportJobRow[]> {
  const { data } = await apiClient.get<{ data: DocumentLineImportJobRow[] }>(
    `/inventory/imports/${kind}/jobs/${encodeURIComponent(jobId)}/rows`,
    { params: { page: 1, pageSize: 5000, status: "VALID" } },
  );
  return data.data;
}

export async function downloadDocumentLineImportErrors(
  kind: DocumentLineImportKind,
  jobId: string,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/${kind}/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, filename);
}

export async function downloadDocumentLineImportTemplate(
  kind: DocumentLineImportKind,
  filename: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/${kind}/import-template.xls`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, filename);
}

export function useValidateDocumentLineImport(kind: DocumentLineImportKind) {
  return useMutation({
    mutationFn: (file: File) => validateDocumentLineImport(kind, file),
  });
}
