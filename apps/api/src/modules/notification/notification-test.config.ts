/**
 * Công tắc của bộ công cụ TẠM "Test thông báo" (`admin/notifications/test/*` +
 * trang cùng tên ở backoffice).
 *
 * Nó tồn tại để xác nhận đường push chạy thật: máy nào đã đăng ký, push có tới
 * không, một loại thông báo thật có đi đúng người không, tắc thì tắc ở đâu.
 *
 * **Không gắn vào hệ phân quyền** — cố ý: đây là đồ dùng một mùa, thêm một
 * permission là để lại rác trong `permissions` và trong mọi vai trò đã gán.
 * Mọi endpoint chỉ đòi ĐĂNG NHẬP.
 *
 * Tắt / bật = sửa hằng này rồi deploy lại; tắt thì toàn bộ endpoint trả 404 như
 * chưa từng có. Khi module thông báo đã chạy ổn định, xoá hẳn:
 * `controllers/admin-notification-test.controller.ts`,
 * `services/notification-test.service.ts`, `dto/notification-test.dto.ts`,
 * file này, và trang `settings/notification-test` bên backoffice.
 */
export const NOTIFICATION_TEST_TOOL_ENABLED = true;
