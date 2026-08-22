---
feature: other-purpose-and-received-transfer-lock
stories: 2
acceptance_criteria: 7
---

# Requirements — Siết "Nhập khác / Xuất khác" và khoá phiếu xuất đã được nhận

Nguyên tắc chung: mọi quyết định đọc **permission key**, không đọc tên vai trò.

## Story 1 — "Nhập khác" / "Xuất khác" là quyền của cấp tổ chức

`purpose = OTHER` cho cả hai phía nghĩa là hàng vào hoặc ra kho mà **không có chứng từ đối
ứng** nào để đối chiếu — không phải mua, không phải bán, không phải điều chuyển. Chi nhánh vận
hành trên chứng từ có đối ứng; loại này để cấp tổ chức.

- **AC-01** — Tạo phiếu xuất `purpose=OTHER` đòi `inventory.goods-issue.other-issue`; tạo phiếu
  nhập `purpose=OTHER` đòi `goods_receipt.other-receipt` (key mới).
- **AC-02** — Chỉ Quản trị hệ thống và Quản lý tổng giữ hai key đó. Quản lý chi nhánh, Nhân
  viên kho, bán hàng, thu ngân đều không.
- **AC-03** — "Hủy hàng" (`DISPOSAL`) theo cùng luật: cũng chỉ Quản trị hệ thống và Quản lý
  tổng giữ. Ghi giảm hàng trên lời khai của chính chi nhánh, không có chứng từ đối ứng nào.
- **AC-07** — Điều chuyển thì giữ nguyên cho Nhân viên kho: chân xuất đó luôn có phiếu nhập của
  chi nhánh nhận ở phía bên kia.
- **AC-04** — UI không mời thao tác đó: người thiếu quyền không chọn được mục đích "Khác" trên
  form phiếu nhập, và không thấy "Xuất khác" trong danh sách mục đích của phiếu xuất.

## Story 2 — Phiếu xuất đóng băng khi chi nhánh nhận đã nhập

Sửa một phiếu xuất điều chuyển đã POSTED sẽ đẩy chênh lệch sang phiếu nhập của chi nhánh nhận
qua `applyLegRevision`. Khi bên nhận đã post phiếu nhập, việc đó ghi đè một chứng từ chi nhánh
khác đã chốt sổ. Đường xoá đã chặn từ trước; đường sửa thì chưa.

- **AC-05** — `PATCH /inventory/goods-issues/:id` bị từ chối khi lệnh điều chuyển tương ứng đã
  có `importGoodsReceiptId`, **không trừ ai** — kể cả Quản trị hệ thống. Lối thoát là chi nhánh
  nhận xoá phiếu nhập trước.
- **AC-06** — Danh sách phiếu xuất khoá sẵn nút **Sửa** và **Xóa** trên dòng đó, kèm tooltip
  nói rõ lý do, thay vì để bấm rồi báo lỗi.

## Not verified here

AC-01/AC-02/AC-03/AC-05 là hợp đồng API và dữ liệu seed, không có bề mặt UI riêng — phủ bởi
`org-role-permissions.spec.ts`, `assert-purpose-permission.spec.ts` và
`goods-issue.service.spec.ts`.
