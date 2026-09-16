import { MEDIA_OWNER_LIMITS, validateFileAgainstLimits } from "../../../lib/media/media-limits";
import {
  GOODS_IMAGE_SIZE_MESSAGE,
  GOODS_IMAGE_TYPE_MESSAGE,
  type GoodsImageOwnerType,
} from "../../../lib/media/upload-goods-images";
import type { ResolvedImageName } from "./resolve-image-names.api";

/**
 * Mô hình thuần (không React) của trang Cập nhật ảnh nhanh. T-02-02 dùng
 * `pending`/`checking`; T-02-03 thêm `uploading`/`done`/`failed` khi bấm Cập nhật.
 */
export type QuickImageStatus = "pending" | "checking" | "uploading" | "done" | "failed";

export interface QuickImageFile {
  /** Khoá React của thẻ (`crypto.randomUUID()`), không đổi khi Đổi ảnh. */
  key: string;
  file: File;
  /** `URL.createObjectURL(file)` — revoke khi bỏ thẻ / Đổi ảnh / unmount. */
  previewUrl: string;
  /** Lỗi giới hạn phía client (định dạng, dung lượng); có lỗi ⇒ không gửi tên đi resolve. */
  localError: string | null;
  /** Kết quả `resolve-image-names`; null khi chưa kiểm tra hoặc có `localError`. */
  resolved: ResolvedImageName | null;
  status: QuickImageStatus;
  /** Thông điệp khi `status === "failed"`. */
  error?: string;
}

export interface QuickImageStatusLabel {
  text: string;
  tone: "ok" | "error" | "muted";
}

const NO_MATCH_MESSAGE = "Không có mã SKU hàng hóa trùng tên ảnh";
const SEQ_RANGE_MESSAGE = "STT phải từ 01 đến 10";
const CHECKING_MESSAGE = "Đang kiểm tra…";
const DONE_MESSAGE = "Đã cập nhật";

const collator = new Intl.Collator("vi", { numeric: true });

/**
 * `validateFileAgainstLimits("PRODUCT", file)` với thông điệp của form hàng hoá
 * (như `upload-goods-images.ts`); tệp rỗng giữ nguyên chuỗi của helper.
 */
export function localErrorFor(file: File): string | null {
  const limitError = validateFileAgainstLimits("PRODUCT", file);
  if (limitError === null) return null;
  const limits = MEDIA_OWNER_LIMITS.PRODUCT;
  if (!limits.contentTypes.includes(file.type)) return GOODS_IMAGE_TYPE_MESSAGE;
  if (file.size > limits.maxBytes) return GOODS_IMAGE_SIZE_MESSAGE;
  return limitError;
}

/** Thẻ có thể gửi đi trong lượt Cập nhật kế tiếp (chưa `done`). */
export function isUpdatable(card: QuickImageFile): boolean {
  return (
    card.localError === null &&
    card.resolved !== null &&
    card.resolved.match !== null &&
    card.resolved.error === null &&
    card.status !== "done"
  );
}

/** k của "Cập nhật k/N ảnh" trước khi chạy (A-16). */
export function countUpdatable(list: readonly QuickImageFile[]): number {
  return list.filter(isUpdatable).length;
}

/** k của "Cập nhật k/N ảnh" sau khi chạy: số thẻ đã gắn xong. */
export function countDone(list: readonly QuickImageFile[]): number {
  return list.filter((card) => card.status === "done").length;
}

function compareCards(a: QuickImageFile, b: QuickImageFile): number {
  const seqA = a.resolved?.seq ?? null;
  const seqB = b.resolved?.seq ?? null;
  if (seqA !== null && seqB !== null && seqA !== seqB) return seqA - seqB;
  if (seqA !== null && seqB === null) return -1;
  if (seqA === null && seqB !== null) return 1;
  return collator.compare(a.file.name, b.file.name);
}

/**
 * Gom các thẻ có thể cập nhật theo `ownerId`, mỗi nhóm sắp theo `seq` tăng dần,
 * `seq` null xếp sau theo tên file — đúng thứ tự gửi vào `set-images` (AC-13).
 * Thứ tự các owner = thứ tự xuất hiện lần đầu trong danh sách.
 */
export function groupByOwner(
  list: readonly QuickImageFile[],
): Map<string, QuickImageFile[]> {
  const groups = new Map<string, QuickImageFile[]>();
  for (const card of list) {
    if (!isUpdatable(card)) continue;
    const ownerId = card.resolved?.ownerId;
    if (!ownerId) continue;
    const group = groups.get(ownerId);
    if (group) group.push(card);
    else groups.set(ownerId, [card]);
  }
  for (const group of groups.values()) group.sort(compareCards);
  return groups;
}

/**
 * Đánh `DUPLICATE_SEQ` cho thẻ đến sau có cùng `(ownerId, seq)` với một thẻ
 * trước nó — cùng quy tắc server áp trong một lượt gọi, nhưng chạy trên toàn
 * danh sách nên thả thêm ở lượt sau vẫn bị bắt (AC-16). Cờ `DUPLICATE_SEQ` cũ
 * (server hay client) được tính lại, nên bỏ thẻ đứng trước sẽ giải phóng thẻ sau.
 * Trả về danh sách mới; thẻ không đổi giữ nguyên tham chiếu.
 */
export function markDuplicateSeq(list: readonly QuickImageFile[]): QuickImageFile[] {
  const seen = new Set<string>();
  return list.map((card) => {
    const resolved = card.resolved;
    if (card.localError !== null || resolved === null) return card;
    const wasDuplicate = resolved.error === "DUPLICATE_SEQ";
    const baseError = wasDuplicate ? null : resolved.error;

    let isDuplicate = false;
    if (baseError === null && resolved.ownerId !== null && resolved.seq !== null) {
      const key = `${resolved.ownerId}:${resolved.seq}`;
      if (seen.has(key)) isDuplicate = true;
      else seen.add(key);
    }

    if (isDuplicate === wasDuplicate) return card;
    return {
      ...card,
      resolved: { ...resolved, error: isDuplicate ? "DUPLICATE_SEQ" : baseError },
    };
  });
}

/** Owner type media cho `uploadGoodsImages`: biến thể gắn vào mẫu mã cha (A-03). */
export function ownerTypeFor(resolved: ResolvedImageName): GoodsImageOwnerType | null {
  switch (resolved.match) {
    case "product":
    case "variant":
      return "PRODUCT";
    case "orphan":
      return "ITEM";
    default:
      return null;
  }
}

function padSeq(seq: number): string {
  return String(seq).padStart(2, "0");
}

/** Dòng trạng thái của thẻ (03-logical-design.md › Error taxonomy). */
export function statusLabel(card: QuickImageFile): QuickImageStatusLabel {
  if (card.localError !== null) return { text: card.localError, tone: "error" };
  if (card.status === "done") return { text: DONE_MESSAGE, tone: "ok" };
  if (card.status === "failed") return { text: card.error ?? "", tone: "error" };
  if (card.status === "checking" || card.resolved === null) {
    return { text: CHECKING_MESSAGE, tone: "muted" };
  }

  const resolved = card.resolved;
  const ownerCode = resolved.ownerCode ?? resolved.code;
  if (resolved.error === "SEQ_OUT_OF_RANGE") return { text: SEQ_RANGE_MESSAGE, tone: "error" };
  if (resolved.error === "DUPLICATE_SEQ") {
    return {
      text: `Trùng STT ${padSeq(resolved.seq ?? 0)} với file khác của mẫu mã ${ownerCode}`,
      tone: "error",
    };
  }
  switch (resolved.match) {
    case "product":
      return { text: `Mẫu mã ${ownerCode}`, tone: "ok" };
    case "orphan":
      return { text: `Hàng hóa ${ownerCode}`, tone: "ok" };
    case "variant":
      return { text: `Gắn vào mẫu mã ${ownerCode} (mã biến thể)`, tone: "ok" };
    default:
      return { text: NO_MATCH_MESSAGE, tone: "error" };
  }
}
