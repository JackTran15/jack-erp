import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiClient } from "../../../lib/api-axios";
import type {
  GoodsReceiptImportJobRow,
  GoodsReceiptImportValidateResponse,
} from "./import-goods-receipt.types";

function messageFromApiErrorBody(body: unknown): string {
  if (!body || typeof body !== "object" || !("message" in body)) return "";
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join("; ");
  return typeof message === "string" ? message : "";
}

export async function getGoodsReceiptImportErrorMessage(
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

export async function validateGoodsReceiptImport(
  file: File,
): Promise<GoodsReceiptImportValidateResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<GoodsReceiptImportValidateResponse>(
    "/inventory/imports/goods-receipts/validate",
    form,
  );
  return data;
}

export async function cancelGoodsReceiptImport(jobId: string): Promise<void> {
  await apiClient.delete(
    `/inventory/imports/goods-receipts/jobs/${encodeURIComponent(jobId)}`,
  );
}

export async function loadValidGoodsReceiptImportRows(
  jobId: string,
): Promise<GoodsReceiptImportJobRow[]> {
  const { data } = await apiClient.get<{
    data: GoodsReceiptImportJobRow[];
  }>(`/inventory/imports/goods-receipts/jobs/${encodeURIComponent(jobId)}/rows`, {
    params: { page: 1, pageSize: 5000, status: "VALID" },
  });
  return data.data;
}

export async function downloadGoodsReceiptImportErrors(
  jobId: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/inventory/imports/goods-receipts/jobs/${encodeURIComponent(jobId)}/error-rows.xlsx`,
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "dong-nhap-kho-loi.xlsx");
}

export async function downloadGoodsReceiptTemplate(): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    "/inventory/imports/goods-receipts/import-template.xlsx",
    { responseType: "blob" },
  );
  triggerBlobDownload(data, "DanhSachHangHoaNhapKho.xlsx");
}

export function useValidateGoodsReceiptImport() {
  return useMutation({ mutationFn: validateGoodsReceiptImport });
}
