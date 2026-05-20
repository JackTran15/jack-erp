import type { EmployeeFormDraft } from "./employee.types";

export interface ValidateEmployeeDraftOptions {
  /** Chỉ dùng khi sửa: user bật "Đổi mật khẩu". */
  changePassword?: boolean;
}

export function validateEmployeeDraft(
  draft: EmployeeFormDraft,
  isEdit: boolean,
  options?: ValidateEmployeeDraftOptions,
): string | null {
  if (!draft.basic.code.trim()) {
    return "Vui lòng nhập mã nhân viên.";
  }
  if (!isEdit && !draft.basic.email.trim()) {
    return "Vui lòng nhập email đăng nhập.";
  }
  if (!draft.basic.fullName.trim()) {
    return "Vui lòng nhập họ và tên.";
  }
  if (draft.basic.allowSoftwareAccess && !isEdit) {
    if (draft.basic.password.length < 8) {
      return "Mật khẩu phải có ít nhất 8 ký tự.";
    }
    if (draft.basic.password !== draft.basic.confirmPassword) {
      return "Xác nhận mật khẩu không khớp.";
    }
  }
  if (isEdit && options?.changePassword) {
    if (draft.basic.password.length < 8) {
      return "Mật khẩu mới phải có ít nhất 8 ký tự.";
    }
    if (draft.basic.password !== draft.basic.confirmPassword) {
      return "Xác nhận mật khẩu không khớp.";
    }
  }
  return null;
}
