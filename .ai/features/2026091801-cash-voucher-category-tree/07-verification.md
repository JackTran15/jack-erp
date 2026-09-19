---
feature: cash-voucher-category-tree
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Danh mục thu chi dạng cây

Fixtures đã có trên `erp_dev_3008`, org MT, tạo qua đúng endpoint UI gọi (18/09/2026, T-01-03 / T-02-01):

| Marker | Bản ghi | Hình dạng |
|---|---|---|
| `CP_VAN_HANH` | Mục chi "Chi phí vận hành", thứ tự 8, mục gốc | Nhóm cha duy nhất trong cây — chevron duy nhất trong bảng |
| `TIEN_DIEN_VH` | Mục chi "Tiền điện", Mục cha = `CP_VAN_HANH` | Mục con duy nhất; cùng tên với `CHI_TIEN_DIEN` mặc định để chứng minh dropdown thụt lề chứ không trùng |
| `PC000038` | Phiếu chi tiền mặt 18/09/2026, 150.000, dòng "Tiền điện tháng 9" gắn `TIEN_DIEN_VH` | Dùng cho S11; nằm trong kỳ "Tháng này" chỉ tới hết 30/09/2026 |

API :4000 phải chạy từ mã của nhánh này (`make dev-api` khởi động lại sau khi checkout — watcher cũ
không nạp route `POST /v2/cash-voucher-categories/tree`, xem T-01-02).

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Menu Danh mục › THU, CHI có "Danh mục thu chi" | `/` | `click text="Danh mục"; wait text="THU, CHI"` | AC-01 | text=Danh mục thu chi |
| S2 | Trang danh mục dạng cây: breadcrumb, Mở rộng/Thu gọn, một chevron ở nhóm cha, không phân trang | `/admin/cash-voucher-categories` | `wait table tbody tr` | AC-01,AC-02 | text=Danh mục thu chi; text=Mở rộng; count table tbody button[aria-label="Thu gọn"] = 1; text=TIEN_DIEN_VH; no-text=kết quả |
| S3 | Thu gọn nhóm cha ẩn mục con | `/admin/cash-voucher-categories` | `wait table tbody tr; click table tbody button[aria-label="Thu gọn"]` | AC-02 | text=CP_VAN_HANH; no-text=TIEN_DIEN_VH |
| S4 | Lọc cột Mã tỉa cây, giữ nhánh cha và mở sẵn | `/admin/cash-voucher-categories` | `wait table tbody tr; fill thead input[placeholder] = TIEN_DIEN; wait tr:has-text("TIEN_DIEN_VH")` | AC-02 | text=CP_VAN_HANH; text=TIEN_DIEN_VH; no-text=THU_BAN_HANG |
| S5 | Dialog tạo mới: Đang hoạt động bật sẵn, Loại có Thu/Chi, có ô Mục cha | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Thêm mới"; wait #field-isActive` | AC-04 | count #field-isActive:checked = 1; count #field-direction option = 3; text=Mục cha |
| S6 | Sửa nhóm cha: picker Mục cha chỉ có mục Chi, không có chính nó và mục con | `/admin/cash-voucher-categories` | `wait table tbody tr; click text="Chi phí vận hành"; wait #field-parentGroupId; click #field-parentGroupId` | AC-03 | count ul[role="listbox"] li:has-text("CP_VAN_HANH") = 0; count ul[role="listbox"] li:has-text("TIEN_DIEN_VH") = 0; count ul[role="listbox"] li:has-text("THU_") = 0; text=CHI_TIEN_DIEN_THOAI |
| S7 | Hồi quy Nhóm hàng hoá: vẫn cây, vẫn nhập/xuất, không phân trang | `/admin/inventory-item-categories` | `wait table tbody tr` | AC-10 | text=Nhóm hàng hoá; text=Mở rộng; text=Nhập khẩu; no-text=kết quả |
| S8 | Phiếu chi tiền mặt: dropdown Mục chi có nhóm cha và mục con thụt lề | `/treasury/cash/receipts-expenses` | `click text="Thêm mới"; click text="Phiếu chi tiền"; wait [role="dialog"] select` | AC-08 | count [role="dialog"] option:has-text("Chi phí vận hành") = 1; count [role="dialog"] option:has-text("Tiền điện") = 3 |
| S9 | Phiếu thu tiền mặt: dropdown Mục thu không lẫn mục chi | `/treasury/cash/receipts-expenses` | `click text="Thêm mới"; click text="Phiếu thu tiền"; wait [role="dialog"] select` | AC-08 | count [role="dialog"] option:has-text("Thu từ bán hàng") = 1; count [role="dialog"] option:has-text("Chi phí vận hành") = 0 |
| S10 | Phiếu chi tiền gửi: cùng cây mục chi | `/treasury/deposit/receipts-expenses` | `click text="Thêm mới"; click text="Phiếu chi tiền gửi"; wait [role="dialog"] select` | AC-08 | count [role="dialog"] option:has-text("Chi phí vận hành") = 1; count [role="dialog"] option:has-text("Tiền điện") = 3 |
| S11 | Phiếu chi đã lưu với mục con mở lại hiện đúng tên, không thụt lề | `/treasury/cash/receipts-expenses` | `click tr:has-text("PC000038")` | AC-08 | text=Tiền điện tháng 9; text=Tiền điện |

## Not verified here

- **AC-05, AC-06** (BE từ chối cha khác loại / tự làm cha / vòng / đổi loại khi có con / xoá khi có con): toast lỗi
  `[data-sonner-toast][data-type="error"]` là `failure_signal` của repo, nên một bước cố ý gây lỗi luôn đỏ dù đúng
  hành vi. Bằng chứng: `cash-voucher-categories.service.spec.ts` (20/20) và e2e
  `cash-voucher-category-tree.e2e-spec.ts` (5/5, gồm đúng chuỗi thông báo và 403). Demo tay: UOW-01 bước 6–8.
- **AC-02 lọc Loại / Đang hoạt động**: bộ lọc là `<select>` thuần, bốn động từ của runner không đặt được giá trị.
  Đã kiểm bằng Playwright ở T-01-03 (`{"direction":"IN"}` → 9 dòng). Demo tay: UOW-01 bước 5.
- **AC-01 vế thiếu quyền**: không có tài khoản local thuộc vai trò thiếu `accounting.cash_voucher_category.read`
  (T-01-04, Akenzy chốt tick kèm ghi chú).
- **AC-07** (endpoint): e2e + curl ở T-01-02. **AC-09** (migration): `migration:run` trên `erp_dev_3008`, up/down trên DB tạm (T-01-01).
- **AC-08 mục đã tắt vẫn hiện tên trên phiếu cũ**: demo tay UOW-02 bước 5 (tắt `TIEN_DIEN_VH` rồi mở lại PC000038).
