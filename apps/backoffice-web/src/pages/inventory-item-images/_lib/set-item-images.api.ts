import { apiClient } from "../../../lib/api-axios";

export interface SetItemImagesAssignment {
  /** products.id (dòng mẫu mã) hoặc items.id (hàng lẻ) — server tự suy owner type. */
  id: string;
  /** Bộ ảnh thay thế toàn bộ, theo thứ tự hiển thị (≤ 10). */
  imageIds: string[];
}

export interface SetItemImagesUpdated {
  id: string;
  code: string;
  imageCount: number;
}

export interface SetItemImagesFailed {
  id: string;
  code: string | null;
  reason: string;
}

/** Mirror `SetItemImagesResponseDto` (hand-typed until T-02-04 regenerates schema.ts). */
export interface SetItemImagesResult {
  updated: SetItemImagesUpdated[];
  failed: SetItemImagesFailed[];
}

/**
 * Khoá idempotency ổn định cho một thao tác — cùng cách băm FNV-1a của
 * `set-item-active-status.api.ts`: derive từ payload đã sắp để bấm đúp / thử
 * lại được replay thay vì ghi hai lần.
 */
function operationKey(assignments: SetItemImagesAssignment[]): string {
  const payload = assignments
    .map((a) => `${a.id}=${a.imageIds.join(",")}`)
    .sort()
    .join(";");
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `set-item-images-${hash.toString(16)}-${assignments.length}`;
}

/** Thông điệp tiếng Việt cho `failed[].reason` (03-logical-design.md › Error taxonomy). */
export function reasonMessage(reason: string): string {
  switch (reason) {
    case "OWNER_NOT_FOUND":
      return "Không tìm thấy hàng hóa";
    case "MEDIA_NOT_FOUND":
      return "Ảnh không hợp lệ, tải lại";
    case "MEDIA_STATE_CONFLICT":
      return "Ảnh đã được dùng ở nơi khác, tải lại";
    case "MEDIA_LIMIT_EXCEEDED":
      return "Tối đa 10 ảnh";
    default:
      return "Cập nhật ảnh thất bại";
  }
}

/** `POST /inventory/items/set-images` — thay bộ ảnh cho từng owner, partial success (ADR-02). */
export async function setItemImages(
  assignments: SetItemImagesAssignment[],
): Promise<SetItemImagesResult> {
  const { data } = await apiClient.post<SetItemImagesResult>(
    "/inventory/items/set-images",
    { assignments },
    { headers: { "X-Idempotency-Key": operationKey(assignments) } },
  );
  return data;
}
