---
feature: transfer-receipt-cross-branch-reference
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Xem Tham chiếu của phiếu nhập kho điều chuyển

Phiếu nhập kho điều chuyển NK000021 (chi nhánh HCM) tham chiếu phiếu xuất kho XK000009 của
chi nhánh nguồn (Chi nhánh 2). Trước sửa: bấm vào XK000009 điều hướng sang trang Xuất kho và
gọi API theo phạm vi chi nhánh hiện tại → 404 → toast "Không tìm thấy dữ liệu.".
Sau sửa: phiếu xuất kho nguồn mở ngay tại chỗ, chỉ đọc, qua route org-scoped của lệnh điều chuyển.

Chiều ngược lại (S5–S6): phiếu xuất điều chuyển không lưu số phiếu nhập vào `references` — khi
lập phiếu xuất thì phiếu nhập chưa tồn tại — nên trước sửa Tham chiếu luôn là "—". Sau sửa, số
phiếu nhập được resolve lúc đọc qua `transfer_orders.import_goods_receipt_id` và mở được từ chi
nhánh nguồn.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách Nhập kho (chi nhánh HCM) có phiếu điều chuyển NK000021 | `/inventory/purchase-orders` | `wait button:has-text("NK000021")` | AC-01 | `text=NK000021` |
| S2 | Phiếu nhập kho NK000021 hiển thị Tham chiếu XK000009 dạng liên kết | `/inventory/purchase-orders` | `click button:has-text("NK000021"); wait text=Phiếu nhập kho NK000021` | AC-01 | `text=Tham chiếu; text=XK000009` |
| S3 | Bấm XK000009 mở phiếu xuất kho của chi nhánh nguồn ngay trên phiếu nhập, không có lỗi | `/inventory/purchase-orders` | `click button:has-text("NK000021"); wait button:has-text("XK000009"); click button:has-text("XK000009"); wait text=Phiếu xuất kho XK000009` | AC-02 | `text=Phiếu xuất kho XK000009; no-text=Không tìm thấy dữ liệu.` |
| S4 | Phiếu xuất kho liên chi nhánh ở chế độ chỉ đọc — nút Sửa bị vô hiệu hóa | `/inventory/purchase-orders` | `click button:has-text("NK000021"); wait button:has-text("XK000009"); click button:has-text("XK000009"); wait text=Phiếu xuất kho XK000009` | AC-03 | `count [role="dialog"]:has-text("Phiếu xuất kho XK000009") button:disabled:has-text("Sửa") = 1` |
| S5 | Chiều ngược lại — phiếu xuất XK000001 (chi nhánh nguồn HCM) hiển thị Tham chiếu là phiếu nhập NK000004 | `/inventory/goods-issues` | `click button:has-text("XK000001"); wait text=Phiếu xuất kho XK000001` | AC-04 | `text=Tham chiếu; text=NK000004` |
| S6 | Bấm NK000004 mở phiếu nhập kho của chi nhánh đích ngay tại chỗ, chỉ đọc | `/inventory/goods-issues` | `click button:has-text("XK000001"); wait button:has-text("NK000004"); click button:has-text("NK000004"); wait text=Phiếu nhập kho NK000004` | AC-04, AC-05 | `text=Phiếu nhập kho NK000004; no-text=Không tìm thấy dữ liệu.; count [role="dialog"]:has-text("Phiếu nhập kho NK000004") button:disabled:has-text("Sửa") = 1` |

## Not verified here

- **In / Xuất khẩu của phiếu xuất kho liên chi nhánh** (route org-scoped
  `/inventory/transfer-orders/:id/export-goods-issue/{print-payload,export}`): bấm "In" mở hộp
  thoại in của trình duyệt, làm treo phiên tự động hóa. Đã kiểm chứng bằng curl (200, xlsx thật)
  và bằng network log trong phiên xác minh thủ công, cùng unit test
  `transfer-order.service.spec.ts` cho phạm vi org-scoped + chặn chi nhánh không tham gia.
- **In / Xuất khẩu của phiếu nhập kho liên chi nhánh** (route
  `/inventory/transfer-orders/:id/import-goods-receipt/{print-payload,export}`): cùng lý do như
  trên. Đã kiểm chứng bằng curl (200, `phieu-nhap-kho.xlsx` thật) và network log khi bấm
  "Xuất khẩu" trong phiên xác minh thủ công.
- **Tab "Điều chuyển từ cửa hàng khác"**: danh sách chỉ liệt kê phiếu chưa nhập kho; ở HCM hiện
  không còn phiếu nào nên không có dữ liệu để chụp.

## Notes

Tài khoản chạy trên chi nhánh HCM (post_login chuyển chi nhánh). NK000021 = phiếu nhập điều
chuyển từ Chi nhánh 2, XK000009 thuộc Chi nhánh 2.
