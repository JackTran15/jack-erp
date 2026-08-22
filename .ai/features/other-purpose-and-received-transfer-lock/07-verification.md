---
feature: other-purpose-and-received-transfer-lock
environments: [local-backoffice-bm]
viewports: [desktop]
---

# Verification — Quản lý chi nhánh không tạo được "Nhập khác" và không sửa được phiếu xuất đã bị nhận

Chạy bằng tài khoản **Quản lý chi nhánh** (`LOCAL_BACKOFFICE_BM_*`), chi nhánh HCM của org
`My Company` trong `erp_dev`. Đây là tài khoản duy nhất chứng minh được cả hai luật: tài khoản
cấp tổ chức vẫn được phép nên không phân biệt được "chặn đúng" với "chưa chặn gì".

Trạng thái quyền sau khi chạy `seed:sync-admin-permissions`, lấy thẳng từ `erp_dev`:

```sql
--  Quản trị hệ thống | other-issue=1 other-receipt=1 disposal=1
--  Quản lý tổng      | other-issue=1 other-receipt=1 disposal=1
--  Quản lý chi nhánh | other-issue=0 other-receipt=0 disposal=1  ← tài khoản chạy verify
--  Nhân viên kho     | other-issue=0 other-receipt=0 disposal=1
```

Chứng từ dùng cho Story 2 — đúng một phiếu, đã được chi nhánh nhận nhập:

```sql
SELECT gi.document_number, gi.status FROM goods_issues gi
JOIN transfer_orders t ON t.id::text = gi.reference_id::text
WHERE gi.reference_type = 'TRANSFER_ORDER' AND t.import_goods_receipt_id IS NOT NULL;
--  XK000001 | POSTED
```

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Form phiếu nhập mở được; mục đích "Khác" bị khoá vì thiếu `goods_receipt.other-receipt` | `/inventory/purchase-orders` | `click button:has-text("Thêm mới"); wait [role="dialog"]; wait text=Mục đích nhập kho` | AC-04 | `text=Mục đích nhập kho; count [role="dialog"] input[type="radio"]:disabled = 1` |
| S2 | Mục đích mặc định rơi về "Điều chuyển từ cửa hàng khác", không phải "Khác" | `/inventory/purchase-orders` | `click button:has-text("Thêm mới"); wait [role="dialog"]; wait text=Mục đích nhập kho` | AC-04 | `text=Điều chuyển từ cửa hàng khác; count [role="dialog"] input[type="radio"]:checked = 1` |
| S3 | Danh sách phiếu xuất mở được bằng quyền `inventory.goods-issue.read` | `/inventory/goods-issues` | `wait button:has-text("Thêm mới")` | AC-06 | `text=XK000001` |
| S4 | Chọn `XK000001` (chi nhánh nhận đã nhập): `Sửa` và `Xóa` đều bị khoá | `/inventory/goods-issues` | `click tr:has-text("XK000001")` | AC-06 | `count button:has-text("Sửa"):disabled = 1; count button:has-text("Xóa"):disabled = 1` |

## Not verified here

- **AC-05** (403 của server) không có bề mặt UI sau khi S4 khoá nút — phủ bởi
  `goods-issue.service.spec.ts` ("refuses the edit once the destination has received").
- **AC-01/02/03** là dữ liệu seed — phủ bởi `org-role-permissions.spec.ts`.
- **"Xuất khác"** đã bị ẩn khỏi danh sách mục đích của form phiếu xuất từ trước bằng
  `creatablePurposes()`; thay đổi lần này chỉ gỡ key khỏi seed nên hành vi UI đó không mới.

## Notes

S2 tồn tại vì mặc định cũ của form là "Khác". Nếu chỉ khoá radio mà không đổi mặc định thì form
mở ra ở một mục đích không lưu được, và người dùng chỉ biết khi bấm Lưu.
