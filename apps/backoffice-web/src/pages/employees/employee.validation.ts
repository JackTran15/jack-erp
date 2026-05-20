import type { EmployeeFormDraft } from "./employee.types";

export function validateEmployeeDraft(
  draft: EmployeeFormDraft,
  isEdit: boolean,
): string | null {
  if (!draft.basic.email.trim()) {
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
  if (draft.basic.allowSoftwareAccess && isEdit && draft.basic.password) {
    if (draft.basic.password.length < 8) {
      return "Mật khẩu phải có ít nhất 8 ký tự.";
    }
    if (draft.basic.password !== draft.basic.confirmPassword) {
      return "Xác nhận mật khẩu không khớp.";
    }
  }
  return null;
}
