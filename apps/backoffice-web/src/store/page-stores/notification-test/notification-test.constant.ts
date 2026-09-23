/**
 * Mã mở khoá trang "Test thông báo".
 *
 * **Không phải bảo mật.** Bundle của Vite là file tĩnh nên mở DevTools là đọc
 * được chuỗi này; nó chỉ chắn người bấm nhầm vào một trang gửi thông báo thật.
 * Cửa thật nằm ở chỗ khác: mọi endpoint đòi đăng nhập và chỉ chạm dữ liệu của
 * tổ chức người gọi.
 */
export const NOTIFICATION_TEST_PASSCODE = "11223344";

/** Mở khoá giữ được bao lâu rồi phải nhập lại (8 giờ). */
export const NOTIFICATION_TEST_UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Bật/tắt mục menu và trang. Công cụ TẠM — khi module thông báo đã chạy ổn,
 * đổi thành `false` rồi deploy là mục menu biến mất (backend còn một công tắc
 * riêng ở `notification-test.config.ts`, phải tắt cả hai mới sạch).
 */
export const NOTIFICATION_TEST_TOOL_ENABLED = true;
