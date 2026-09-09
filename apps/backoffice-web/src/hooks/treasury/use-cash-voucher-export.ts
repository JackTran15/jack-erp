import { isAxiosError } from "axios";
import { apiClient } from "../../lib/api-axios";
import { triggerBlobDownload } from "../../lib/download";

/** Used only when the server's own `Content-Disposition` is missing or stripped. */
const FALLBACK_FILENAME = "thu-chi-tien-mat.xlsx";

/** Read the server-chosen filename; it names the export, not a hardcoded string. */
function filenameFrom(disposition: unknown, fallback: string): string {
  if (typeof disposition !== "string") return fallback;
  const match = /filename="?([^"\n]+)"?/i.exec(disposition);
  return match?.[1]?.trim() || fallback;
}

function messageFromApiErrorBody(body: unknown): string {
  if (!body || typeof body !== "object" || !("message" in body)) return "";
  const message = (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join("; ");
  return typeof message === "string" ? message : "";
}

/**
 * `apiClient.post(..., { responseType: "blob" })` keeps the response a Blob on
 * error too, so the row-cap 400's JSON `message` (ADR-06) arrives as a Blob
 * instead of parsed JSON. Read it back out so the caller can tell the user to
 * narrow the filter instead of showing a generic failure toast.
 */
async function messageFromExportError(
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

/**
 * Download the merged cash voucher list ("Thu, chi tiền mặt") as .xlsx —
 * `POST /v2/cash-vouchers/export`.
 *
 * `body` must be the exact object the page already builds for
 * `POST /v2/cash-vouchers/search`. Reusing it instead of building a second
 * filter is what keeps the exported file matching what the grid shows
 * (ADR-06) — the entire bug class AC-17 exists to catch.
 */
export async function downloadCashVoucherListExport(
  body: Record<string, unknown>,
): Promise<void> {
  try {
    const response = await apiClient.post<Blob>("/v2/cash-vouchers/export", body, {
      responseType: "blob",
    });
    triggerBlobDownload(
      response.data,
      filenameFrom(response.headers?.["content-disposition"], FALLBACK_FILENAME),
    );
  } catch (error) {
    throw new Error(await messageFromExportError(error, "Xuất khẩu thất bại."));
  }
}
