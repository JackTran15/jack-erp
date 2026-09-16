import { erpApi, requireErpData } from "../erp-api";
import type { MediaOwnerType } from "./media-limits";

/**
 * `erpApi.POST<T>` takes an untyped path string and an `unknown` body — it
 * does not derive request/response shapes from `paths`/`components`, so it
 * cannot type-check against the OpenAPI contract itself. These interfaces
 * mirror `RequestMediaUploadResponseDto` / `CompleteMediaUploadResponseDto`
 * (apps/api/src/modules/media/dto/media-upload.response.dto.ts) by hand,
 * following the same hand-rolled-DTO-mirror pattern the rest of the
 * backoffice already uses for every other endpoint (e.g. `UserDetail` in
 * useUserMutations.ts).
 */
export interface UploadPolicy {
  url: string;
  fields: Record<string, string>;
}

export interface RequestMediaUploadResponse {
  mediaId: string;
  upload: UploadPolicy;
  expiresAt: string;
}

export type MediaStatus = "PENDING" | "UPLOADED" | "ATTACHED" | "DELETED";

export interface CompleteMediaUploadResponse {
  mediaId: string;
  status: MediaStatus;
  fileName: string;
  contentType: string;
  size: number;
}

export interface CreateMediaUploadBody {
  ownerType: MediaOwnerType;
  fileName: string;
  contentType: string;
  size: number;
}

/** Internal diagnostic only; never shown to the user (see useMediaUpload's messageForError). */
export class UploadFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadFailedError";
  }
}

export async function createUpload(body: CreateMediaUploadBody): Promise<RequestMediaUploadResponse> {
  return requireErpData(
    await erpApi.POST<RequestMediaUploadResponse>("/media/uploads", { body }),
  );
}

export async function completeUpload(mediaId: string): Promise<CompleteMediaUploadResponse> {
  return requireErpData(
    await erpApi.POST<CompleteMediaUploadResponse>("/media/uploads/{id}/complete", {
      params: { path: { id: mediaId } },
    }),
  );
}

/**
 * Posts the file bytes straight to storage (03-logical-design.md, write flow
 * step 2). Deliberately bypasses `erpApi`/axios: their interceptor attaches
 * `Authorization`, `X-Branch-Id` and `X-Idempotency-Key` to every request
 * (apps/backoffice-web/src/lib/api-axios.ts:37-55), none of which the
 * presigned POST policy expects. `upload.fields` already carries the exact
 * `Content-Type` the policy was signed with, so it is appended verbatim; the
 * browser must not set its own. `file` is appended last, as the policy
 * requires.
 */
export async function uploadToStorage(upload: UploadPolicy, file: File, signal?: AbortSignal): Promise<void> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) {
    formData.append(key, value);
  }
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(upload.url, {
      method: "POST",
      body: formData,
      credentials: "omit",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    throw new UploadFailedError("storage POST network error");
  }

  if (!response.ok) {
    throw new UploadFailedError(`storage POST failed: HTTP ${response.status}`);
  }
}
