import { HttpError } from "../../lib/http";

const IAM_ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Dữ liệu không hợp lệ",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này",
};

export function getIamErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof HttpError)) {
    return err instanceof Error ? err.message : fallback;
  }

  const { status, message, code } = err.error;
  const lower = message.toLowerCase();

  if (status === 409 || lower.includes("email")) {
    return "Email đã được sử dụng trong tổ chức";
  }
  if (
    status === 400 &&
    (lower.includes("role") ||
      lower.includes("branch") ||
      lower.includes("vai trò") ||
      lower.includes("chi nhánh"))
  ) {
    return "Vai trò hoặc chi nhánh không thuộc tổ chức này";
  }
  if (status === 400 && lower.includes("deactivate your own")) {
    return "Không thể ngừng hoạt động tài khoản của chính bạn";
  }
  if (
    status === 400 &&
    (lower.includes("system role") ||
      lower.includes("isSystem") ||
      lower.includes("hệ thống"))
  ) {
    return "Không thể đổi tên hoặc xóa vai trò hệ thống";
  }
  if (status === 403) {
    return IAM_ERROR_MESSAGES.FORBIDDEN;
  }
  if (code && IAM_ERROR_MESSAGES[code]) {
    return IAM_ERROR_MESSAGES[code];
  }
  return message || fallback;
}
