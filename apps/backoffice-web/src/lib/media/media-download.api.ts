import { erpApi, requireErpData } from "../erp-api";

/**
 * Mirrors `GetMediaDownloadUrlResponseDto`
 * (apps/api/src/modules/media/dto/media-download.response.dto.ts) by hand —
 * same reason as `media-upload.api.ts`: `erpApi.GET<T>` does not derive its
 * shape from the OpenAPI contract.
 */
export interface MediaDownloadUrl {
  url: string;
  expiresAt: string | null;
}

export async function getDownloadUrl(mediaId: string): Promise<MediaDownloadUrl> {
  return requireErpData(
    await erpApi.GET<MediaDownloadUrl>("/media/{id}/download-url", {
      params: { path: { id: mediaId } },
    }),
  );
}
