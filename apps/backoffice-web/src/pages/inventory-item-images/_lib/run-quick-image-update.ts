import {
  GOODS_IMAGE_COUNT_MESSAGE,
  uploadGoodsImages,
} from "../../../lib/media/upload-goods-images";
import {
  groupByOwner,
  isUpdatable,
  ownerTypeFor,
  type QuickImageFile,
  type QuickImageStatus,
} from "./quick-image-files";
import { reasonMessage, setItemImages } from "./set-item-images.api";

/** Mirror `SetItemImagesDto.assignments[].imageIds` (≤ 10) — chặn trước khi tốn hạn mức tải. */
const MAX_IMAGES_PER_OWNER = 10;
const CONCURRENCY = 3;
const SIBLING_FAILED_MESSAGE = "Không gắn vì file khác của mẫu mã lỗi";

export interface RunQuickImageUpdateOptions {
  signal: AbortSignal;
  onCardStatus: (key: string, status: QuickImageStatus, error?: string) => void;
  onOwnerDone: (ownerId: string, ok: boolean) => void;
}

export interface RunQuickImageUpdateResult {
  /** Số thẻ chuyển sang `done` trong lượt này. */
  done: number;
  /** Số thẻ chuyển sang `failed` trong lượt này. */
  failed: number;
}

/**
 * ADR-04: đi tuần tự theo owner — tải các file của owner (≤ 3 đồng thời), đủ
 * thì `set-images` ngay, rồi owner kế. Một file lỗi ⇒ owner đó không được gắn
 * (tránh thay bộ ảnh bằng bộ thiếu), các owner khác vẫn chạy. Chỉ chạy các thẻ
 * `isUpdatable` (chưa `done`); huỷ qua `signal` ⇒ dừng sạch, thẻ đang tải về
 * `pending`, thẻ chưa tới lượt giữ nguyên.
 */
export async function runQuickImageUpdate(
  cards: readonly QuickImageFile[],
  opts: RunQuickImageUpdateOptions,
): Promise<RunQuickImageUpdateResult> {
  const { signal, onCardStatus, onOwnerDone } = opts;
  const groups = groupByOwner(cards.filter(isUpdatable));
  const result: RunQuickImageUpdateResult = { done: 0, failed: 0 };

  const failAll = (group: QuickImageFile[], message: string) => {
    for (const card of group) onCardStatus(card.key, "failed", message);
    result.failed += group.length;
  };

  for (const [ownerId, group] of groups) {
    if (signal.aborted) break;

    if (group.length > MAX_IMAGES_PER_OWNER) {
      failAll(group, GOODS_IMAGE_COUNT_MESSAGE);
      onOwnerDone(ownerId, false);
      continue;
    }

    // `groupByOwner` chỉ giữ thẻ có `resolved.match`, nên owner type luôn có.
    const ownerType = ownerTypeFor(group[0].resolved!) ?? "PRODUCT";
    for (const card of group) onCardStatus(card.key, "uploading");

    let uploads;
    try {
      uploads = await uploadGoodsImages(
        ownerType,
        group.map((card) => card.file),
        { concurrency: CONCURRENCY, signal },
      );
    } catch (err) {
      if (signal.aborted) {
        for (const card of group) onCardStatus(card.key, "pending");
        break;
      }
      console.warn("quick image upload failed", err);
      failAll(group, reasonMessage("UNKNOWN"));
      onOwnerDone(ownerId, false);
      continue;
    }

    if (uploads.some((u) => u.error !== undefined)) {
      uploads.forEach((u, i) =>
        onCardStatus(group[i].key, "failed", u.error ?? SIBLING_FAILED_MESSAGE),
      );
      result.failed += group.length;
      onOwnerDone(ownerId, false);
      continue;
    }

    const imageIds = uploads.map((u) => u.mediaId as string);
    try {
      const response = await setItemImages([{ id: ownerId, imageIds }]);
      const failed = response.failed[0];
      if (failed) {
        failAll(group, reasonMessage(failed.reason));
        onOwnerDone(ownerId, false);
        continue;
      }
      for (const card of group) onCardStatus(card.key, "done");
      result.done += group.length;
      onOwnerDone(ownerId, true);
    } catch (err) {
      console.warn("set item images failed", err);
      failAll(group, reasonMessage("UNKNOWN"));
      onOwnerDone(ownerId, false);
    }
  }

  return result;
}
