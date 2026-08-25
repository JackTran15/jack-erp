import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";

/**
 * FNV-1a 32-bit. Chỉ cần phân biệt hai payload khác nhau (không phải chống va
 * chạm chủ đích), nên không dùng `crypto.subtle` — hàm này phải đồng bộ để gọi
 * được ngay trong service layer.
 */
function hashPayload(body: unknown): string {
  const text = JSON.stringify(body) ?? "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Khoá `X-Idempotency-Key` cho các endpoint TẠO hóa đơn (`POST /invoices`,
 * `/invoices/returns`, `/invoices/exchanges`).
 *
 * `nonce` = của tab đang thao tác, giữ nguyên qua các lần bấm lại và chỉ đổi
 * sau khi chứng từ lập xong; `hash` = vân tay payload. Ghép hai phần cho đúng
 * ba trường hợp:
 *   - bấm lại / retry mạng với đúng giỏ hàng cũ → cùng khoá → BE replay đúng
 *     hóa đơn đã tạo, không đẻ thêm draft (đây là lỗi đang thấy trên prod);
 *   - bấm lại sau khi ĐÃ SỬA giỏ → payload đổi → khoá đổi → tạo hóa đơn mới,
 *     không dính 409 `IDEMPOTENCY_CONFLICT` (BE giữ record 24h);
 *   - bán hai đơn giống hệt nhau liên tiếp trên cùng tab → nonce đã đổi sau
 *     lần thanh toán trước → khoá khác → đúng hai hóa đơn.
 */
export function invoiceCreateIdempotencyKey(body: unknown): string {
  const nonce = usePosCheckoutSessionStore
    .getState()
    .ensureCheckoutAttemptKey();
  return `${nonce}-${hashPayload(body)}`;
}
