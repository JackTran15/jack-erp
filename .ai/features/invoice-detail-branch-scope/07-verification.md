---
feature: invoice-detail-branch-scope
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Chi tiết hóa đơn mở đúng chi nhánh

Mã hóa đơn chỉ unique theo `(organization_id, branch_id, code)` — mỗi chi nhánh đánh số riêng —
nên `GET /reports/invoices/detail?code=` tra org-wide có thể trả về hóa đơn trùng số của chi
nhánh khác. Đây là lỗi được báo: dòng `2608250029` của Mậu Thân – Cần Thơ là 949k nhưng dialog
hiển thị 850k của chi nhánh khác.

Sau sửa, mỗi dòng báo cáo mang theo `_invoiceId` và dialog tra theo `id`; nhánh chỉ có `code`
(drill-down bên Quỹ tiền) thì ưu tiên chi nhánh của phiên đăng nhập trước khi fallback org-wide.

## Fixture

DB dev không có mã trùng, nên dựng lại đúng tình huống trên:

- `2608220001` của **HCM** (9.450.000, 14 dòng `ABA2777-*`) là hóa đơn có sẵn.
- Thêm một hóa đơn **mồi** cùng mã `2608220001` ở chi nhánh **Chi nhánh kiểm thử** (111.000,
  một dòng `HANG CHI NHANH KIEM THU`), rồi `UPDATE` hóa đơn HCM để tuple của nó nằm sau tuple
  mồi trong heap.
- Kết quả: `SELECT … WHERE organization_id=… AND code='2608220001' LIMIT 1` (đúng hình dạng
  lookup cũ) trả về **hóa đơn mồi 111.000** — tức là bản build trước khi sửa hiển thị 111.000
  cho CẢ HAI dòng, trượt S2.
- Tài khoản `admin@erp.local` có quyền xem hợp nhất nên bảng kê liệt kê cả hai chi nhánh. Đó
  chính là trường hợp khó: chỉ scope theo chi nhánh đang đăng nhập là không đủ, phải tra theo
  `id` của đúng dòng vừa bấm.

Migration `WidenInvoiceCodeUniqueToBranch1789300200000` phải chạy trước (dev DB còn index cũ
`uq_invoice_org_code`, prod thì đã có index theo chi nhánh — chính vì thế prod mới trùng mã).

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Bảng kê liệt kê HAI hóa đơn trùng mã 2608220001 — HCM 9.450.000 và Chi nhánh kiểm thử 111.000 | `/reports/sales#invoice_and_order_list` | `fill [aria-label="Từ ngày"] = 2026-08-22; fill [aria-label="Đến ngày"] = 2026-08-22; click button:has-text("Lấy dữ liệu"); wait a:has-text("2608220001")` | AC-01 | `text=2608220001; text=9.450.000; text=111.000; count a:has-text("2608220001") = 2` |
| S2 | Bấm mã trên dòng HCM mở đúng hóa đơn HCM, không phải hóa đơn trùng số của chi nhánh kia | `/reports/sales#invoice_and_order_list` | `fill [aria-label="Từ ngày"] = 2026-08-22; fill [aria-label="Đến ngày"] = 2026-08-22; click button:has-text("Lấy dữ liệu"); wait a:has-text("2608220001"); click tr:has-text("9.450.000") a:has-text("2608220001"); wait text=HÓA ĐƠN THANH TOÁN` | AC-01, AC-02 | `text=HÓA ĐƠN THANH TOÁN; text=9.450.000; text=ABA2777-N-44; no-text=HANG CHI NHANH KIEM THU` |
| S3 | Bấm mã trên dòng chi nhánh kia mở đúng hóa đơn của chi nhánh đó — mỗi dòng mở hóa đơn của chính nó | `/reports/sales#invoice_and_order_list` | `fill [aria-label="Từ ngày"] = 2026-08-22; fill [aria-label="Đến ngày"] = 2026-08-22; click button:has-text("Lấy dữ liệu"); wait a:has-text("2608220001"); click tr:has-text("111.000") a:has-text("2608220001"); wait text=HÓA ĐƠN THANH TOÁN` | AC-02 | `text=HÓA ĐƠN THANH TOÁN; text=HANG CHI NHANH KIEM THU; no-text=ABA2777-N-44` |

## Not verified here

- **Drill-down "Chi tiết doanh thu theo mặt hàng"** dùng đúng một cơ chế (`_invoiceId` trên dòng
  → `id` trên request), khác mỗi báo cáo nguồn. Che bởi unit test
  `invoice-order-listing.report.spec.ts` (dòng mang `_invoiceId`) và
  `get-invoice-detail.handler.spec.ts` (tra theo id / ưu tiên chi nhánh / fallback org-wide).
- **Nhánh `code`-only của Quỹ tiền**: không dựng được mã trùng cho phiếu thu trên DB dev trong
  phạm vi lần sửa này; ba test trong `get-invoice-detail.handler.spec.ts` phủ đúng ba đường đi.
- **Mobile**: trang báo cáo là lưới rộng chỉ thiết kế cho desktop; chụp mobile chỉ tạo nhiễu.

## Notes

Tài khoản `admin@erp.local`, chi nhánh HCM (post_login chuyển chi nhánh). Bộ lọc mặc định là "Hôm nay", nên hai
bước đều đặt lại Từ ngày/Đến ngày = 22/08/2026 trước khi bấm "Lấy dữ liệu".
