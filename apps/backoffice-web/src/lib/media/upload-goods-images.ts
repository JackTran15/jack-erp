import { HttpError } from "../http";
import { completeUpload, createUpload, uploadToStorage } from "./media-upload.api";
import { MEDIA_OWNER_LIMITS, validateFileAgainstLimits } from "./media-limits";

export type GoodsImageOwnerType = "PRODUCT" | "ITEM";

export type UploadedGoodsImage =
  | { file: File; mediaId: string; error?: undefined }
  | { file: File; mediaId?: undefined; error: string };

export interface UploadGoodsImagesOptions {
  signal?: AbortSignal;
  /** Số file tải đồng thời; mặc định 3 (ADR-04). */
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 3;

/** Chuỗi của form hàng hoá (03-logical-design.md › Error taxonomy). */
export const GOODS_IMAGE_TYPE_MESSAGE = "Chỉ hỗ trợ .jpg, .jpeg, .png, .gif, .webp";
export const GOODS_IMAGE_SIZE_MESSAGE = "Mỗi ảnh tối đa 2MB";
export const GOODS_IMAGE_COUNT_MESSAGE = "Tối đa 10 ảnh";
const QUOTA_MESSAGE = "Hết hạn mức tải lên trong ngày, thử lại sau";
const FALLBACK_MESSAGE = "Tải ảnh thất bại, thử lại";

/**
 * `validateFileAgainstLimits` là cổng kiểm tra (không gọi API khi lỗi); thông
 * điệp thì đổi sang chuỗi của form hàng hoá để hai màn hình nói cùng một giọng.
 * Trường hợp còn lại (tệp rỗng) giữ nguyên chuỗi của helper.
 */
function limitMessage(ownerType: GoodsImageOwnerType, file: File, fallback: string): string {
  const limits = MEDIA_OWNER_LIMITS[ownerType];
  if (!limits.contentTypes.includes(file.type)) return GOODS_IMAGE_TYPE_MESSAGE;
  if (file.size > limits.maxBytes) return GOODS_IMAGE_SIZE_MESSAGE;
  return fallback;
}

/**
 * Bản sao tối thiểu của `messageForError` trong `useMediaUpload.ts` (hàm đó
 * không export và chuỗi của nó là của form, không phải của trang ảnh).
 * `UploadFailedError` (storage/mạng) và mọi lỗi lạ đều về chuỗi dự phòng.
 */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    switch (err.error.code) {
      case "MEDIA_QUOTA_EXCEEDED":
        return QUOTA_MESSAGE;
      case "MEDIA_TYPE_NOT_ALLOWED":
        return GOODS_IMAGE_TYPE_MESSAGE;
      case "MEDIA_TOO_LARGE":
        return GOODS_IMAGE_SIZE_MESSAGE;
      case "MEDIA_LIMIT_EXCEEDED":
        return GOODS_IMAGE_COUNT_MESSAGE;
      default:
        return FALLBACK_MESSAGE;
    }
  }
  return FALLBACK_MESSAGE;
}

async function uploadOne(
  ownerType: GoodsImageOwnerType,
  file: File,
  signal: AbortSignal | undefined,
): Promise<UploadedGoodsImage> {
  const limitError = validateFileAgainstLimits(ownerType, file);
  if (limitError) {
    return { file, error: limitMessage(ownerType, file, limitError) };
  }
  try {
    const ticket = await createUpload({
      ownerType,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
    signal?.throwIfAborted();
    await uploadToStorage(ticket.upload, file, signal);
    signal?.throwIfAborted();
    const completed = await completeUpload(ticket.mediaId);
    return { file, mediaId: completed.mediaId };
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn("goods image upload failed", err);
    return { file, error: uploadErrorMessage(err) };
  }
}

/**
 * Tải N ảnh hàng hoá: mỗi file `validateFileAgainstLimits` → `createUpload` →
 * `uploadToStorage` (fetch trần) → `completeUpload`, đồng thời tối đa
 * `concurrency`. Kết quả giữ đúng thứ tự `files`; một file lỗi không chặn
 * file khác — caller quyết định có gọi `set-images` hay không (ADR-04).
 * Huỷ qua `signal` ⇒ promise reject bằng `AbortError`.
 */
export async function uploadGoodsImages(
  ownerType: GoodsImageOwnerType,
  files: File[],
  opts: UploadGoodsImagesOptions = {},
): Promise<UploadedGoodsImage[]> {
  const { signal } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const results: UploadedGoodsImage[] = new Array(files.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      signal?.throwIfAborted();
      const index = next;
      next += 1;
      results[index] = await uploadOne(ownerType, files[index], signal);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
