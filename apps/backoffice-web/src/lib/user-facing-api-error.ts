import { isAxiosError } from "axios";
import { HttpError } from "./http";

const MISSING_PERMISSION_PREFIX = "Missing required permission:";

/** Known API permission keys → short Vietnamese copy for operators (no raw keys on UI). */
const PERMISSION_MESSAGES: Record<string, string> = {
  "reporting.dashboard.branch.read":
    "Bạn không có quyền xem bảng điều khiển báo cáo theo chi nhánh. Liên hệ quản trị viên nếu cần truy cập.",
  "reporting.dashboard.consolidated.read":
    "Bạn không có quyền xem báo cáo gộp toàn hệ thống. Liên hệ quản trị viên nếu cần truy cập.",
  "org.registration.approve":
    "Bạn không có quyền phê duyệt đăng ký tổ chức. Liên hệ quản trị viên nếu cần truy cập.",
  "branch.registration.approve":
    "Bạn không có quyền phê duyệt đăng ký chi nhánh. Liên hệ quản trị viên nếu cần truy cập.",
  "inventory.purchase-order.read":
    "Bạn không có quyền xem phiếu đặt hàng. Liên hệ quản trị viên nếu cần truy cập.",
  "inventory.purchase-order.create":
    "Bạn không có quyền tạo phiếu đặt hàng. Liên hệ quản trị viên nếu cần truy cập.",
  "inventory.purchase-order.approve":
    "Bạn không có quyền duyệt phiếu đặt hàng. Liên hệ quản trị viên nếu cần truy cập.",
  "inventory.purchase-order.receive":
    "Bạn không có quyền nhận hàng cho phiếu đặt hàng. Liên hệ quản trị viên nếu cần truy cập.",
  "inventory.purchase-order.cancel":
    "Bạn không có quyền huỷ phiếu đặt hàng. Liên hệ quản trị viên nếu cần truy cập.",
};

function messageFromMissingPermission(apiMessage: string): string | null {
  const trimmed = apiMessage.trim();
  if (!trimmed.startsWith(MISSING_PERMISSION_PREFIX)) return null;
  const key = trimmed.slice(MISSING_PERMISSION_PREFIX.length).trim();
  return PERMISSION_MESSAGES[key] ?? "Bạn không có quyền thực hiện thao tác này. Liên hệ quản trị viên.";
}

function mapKnownBodyMessage(message: string): string | null {
  if (message === "Authentication context missing") {
    return "Phiên làm việc không hợp lệ. Vui lòng đăng nhập lại.";
  }
  return messageFromMissingPermission(message);
}

/**
 * Turns API/transport errors into Vietnamese UI copy. Avoids exposing raw
 * permission keys or internal English phrases where a safe mapping exists.
 */
function messageFromAxiosData(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    return String((data as { message: unknown }).message);
  }
  return "";
}

function userFacingFromHttpStatus(
  status: number,
  message: string,
): string | null {
  const mapped = message ? mapKnownBodyMessage(message) : null;
  if (mapped) return mapped;

  if (status === 401) {
    return "Phiên đăng nhập hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.";
  }
  if (status === 403) {
    return "Bạn không có quyền truy cập tài nguyên này.";
  }
  if (status === 404) {
    return "Không tìm thấy dữ liệu.";
  }
  if (status >= 500) {
    return "Máy chủ gặp sự cố. Vui lòng thử lại sau.";
  }
  if (status > 0 && message && !looksLikeTechnicalMessage(message)) {
    return message;
  }
  return null;
}

export function getUserFacingApiErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const bodyMessage = messageFromAxiosData(err.response?.data);
    const fromStatus = userFacingFromHttpStatus(status, bodyMessage);
    if (fromStatus) return fromStatus;
    return "Đã xảy ra lỗi khi tải dữ liệu.";
  }

  if (err instanceof HttpError) {
    const { status, message } = err.error;
    const mapped = mapKnownBodyMessage(message);
    if (mapped) return mapped;

    const fromStatus = userFacingFromHttpStatus(status, message);
    if (fromStatus) return fromStatus;
    return "Đã xảy ra lỗi khi tải dữ liệu.";
  }

  if (err instanceof Error) {
    const axiosStatus = err.message.match(
      /Request failed with status code (\d+)/i,
    );
    if (axiosStatus) {
      const status = Number(axiosStatus[1]);
      const fromStatus = userFacingFromHttpStatus(status, "");
      if (fromStatus) return fromStatus;
    }
    const mapped = mapKnownBodyMessage(err.message);
    if (mapped) return mapped;
    if (err.message && !looksLikeTechnicalMessage(err.message)) {
      return err.message;
    }
    return "Đã xảy ra lỗi khi tải dữ liệu.";
  }

  return "Đã xảy ra lỗi khi tải dữ liệu.";
}

function looksLikeTechnicalMessage(message: string): boolean {
  if (message.startsWith(MISSING_PERMISSION_PREFIX)) return true;
  if (/^HTTP \d+/i.test(message)) return true;
  if (/request failed with status code \d+/i.test(message)) return true;
  return false;
}
