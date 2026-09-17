import {
  GOODS_IMAGE_COUNT_MESSAGE,
  uploadGoodsImages,
  type GoodsImageOwnerType,
  type UploadedGoodsImage,
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

/** Một owner trong lượt chạy: các file của nó trên hàng đợi chung và bộ đếm để biết khi nào đủ. */
interface OwnerRun {
  ownerId: string;
  ownerType: GoodsImageOwnerType;
  group: QuickImageFile[];
  /** Kết quả theo đúng chỉ số của `group`. */
  uploads: UploadedGoodsImage[];
  /** Số file đã được worker nhận; `group.slice(0, started)` là các thẻ đang/đã tải. */
  started: number;
  /** Số file chưa xong; về 0 ⇒ gắn. */
  remaining: number;
}

/**
 * ADR-04 (sửa T-02-05): hàng đợi file phẳng theo thứ tự owner, 3 worker kéo
 * chung — tổng `/media/uploads` đang bay ≤ 3 trên toàn lượt, không phải trong
 * một owner (hầu hết mã chỉ có một file). Worker tải xong file cuối của owner
 * thì `set-images` cho owner ấy ngay. Một file lỗi ⇒ owner đó không được gắn
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

  const attach = async ({ ownerId, group, uploads }: OwnerRun) => {
    if (uploads.some((u) => u.error !== undefined)) {
      uploads.forEach((u, i) =>
        onCardStatus(group[i].key, "failed", u.error ?? SIBLING_FAILED_MESSAGE),
      );
      result.failed += group.length;
      onOwnerDone(ownerId, false);
      return;
    }

    const imageIds = uploads.map((u) => u.mediaId as string);
    try {
      const response = await setItemImages([{ id: ownerId, imageIds }]);
      const failed = response.failed[0];
      if (failed) {
        failAll(group, reasonMessage(failed.reason));
        onOwnerDone(ownerId, false);
        return;
      }
      for (const card of group) onCardStatus(card.key, "done");
      result.done += group.length;
      onOwnerDone(ownerId, true);
    } catch (err) {
      console.warn("set item images failed", err);
      failAll(group, reasonMessage("UNKNOWN"));
      onOwnerDone(ownerId, false);
    }
  };

  const runs: OwnerRun[] = [];
  const queue: { run: OwnerRun; index: number }[] = [];
  for (const [ownerId, group] of groups) {
    if (group.length > MAX_IMAGES_PER_OWNER) {
      failAll(group, GOODS_IMAGE_COUNT_MESSAGE);
      onOwnerDone(ownerId, false);
      continue;
    }
    const run: OwnerRun = {
      ownerId,
      // `groupByOwner` chỉ giữ thẻ có `resolved.match`, nên owner type luôn có.
      ownerType: ownerTypeFor(group[0].resolved!) ?? "PRODUCT",
      group,
      uploads: new Array(group.length),
      started: 0,
      remaining: group.length,
    };
    runs.push(run);
    group.forEach((_, index) => queue.push({ run, index }));
  }

  let next = 0;
  const worker = async () => {
    while (next < queue.length && !signal.aborted) {
      const { run, index } = queue[next];
      next += 1;
      run.started += 1;
      const card = run.group[index];
      onCardStatus(card.key, "uploading");
      try {
        const [uploaded] = await uploadGoodsImages(run.ownerType, [card.file], { signal });
        run.uploads[index] = uploaded;
      } catch (err) {
        if (signal.aborted) return;
        console.warn("quick image upload failed", err);
        run.uploads[index] = { file: card.file, error: reasonMessage("UNKNOWN") };
      }
      run.remaining -= 1;
      if (run.remaining === 0) await attach(run);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );

  if (signal.aborted) {
    for (const run of runs) {
      if (run.remaining === 0) continue;
      for (const card of run.group.slice(0, run.started)) onCardStatus(card.key, "pending");
    }
  }

  return result;
}
