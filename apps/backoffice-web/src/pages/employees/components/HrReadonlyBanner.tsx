export function HrReadonlyBanner() {
  return (
    <div
      className="mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
    >
      Dữ liệu HR sẽ được đồng bộ trong phiên bản sau. Hiện chỉ lưu thông tin
      tài khoản (email, họ tên, vai trò, chi nhánh, mật khẩu).
    </div>
  );
}
