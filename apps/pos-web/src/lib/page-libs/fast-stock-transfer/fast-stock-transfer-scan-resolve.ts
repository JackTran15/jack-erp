import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";

/**
 * Việc cần làm sau khi người dùng bấm Enter trong ô "Hàng hóa" của Kho tạm.
 *
 * - `add`     — đã xác định được đúng một mặt hàng; chọn nó rồi thêm dòng ngay.
 * - `suggest` — nhiều ứng viên; mở danh sách để người dùng chọn, KHÔNG thêm dòng.
 * - `empty`   — có chữ trong ô nhưng không tra ra gì; giữ nguyên chữ để sửa tay.
 * - `none`    — không có gì để làm.
 */
export type ScanOutcome =
  | { kind: "add"; product: PosCatalogLine }
  | { kind: "suggest"; candidates: PosCatalogLine[] }
  | { kind: "empty" }
  | { kind: "none" };

export interface ScanOutcomeInput {
  /** Dòng đang được làm nổi trong dropdown, nếu có. */
  highlighted: PosCatalogLine | null;
  /** Chuỗi đang nằm trong ô nhập. */
  query: string;
  /** Kết quả đã tra được — khớp tuyệt đối, hoặc tìm gần đúng khi khớp tuyệt đối trượt. */
  candidates: PosCatalogLine[];
}

/**
 * Bảng quyết định của phím Enter, tách khỏi React để test được và để chỉ có
 * đúng một chỗ định nghĩa nó.
 *
 * `highlighted` thắng mọi thứ: người dùng đã chủ động chọn dòng đó bằng mũi tên
 * hoặc nó là dòng đầu được làm nổi sẵn, nên ý định đã rõ.
 */
export function decideScanOutcome({
  highlighted,
  query,
  candidates,
}: ScanOutcomeInput): ScanOutcome {
  if (highlighted) return { kind: "add", product: highlighted };
  if (!query.trim()) return { kind: "none" };
  if (candidates.length === 1) return { kind: "add", product: candidates[0]! };
  if (candidates.length > 1) return { kind: "suggest", candidates };
  return { kind: "empty" };
}
