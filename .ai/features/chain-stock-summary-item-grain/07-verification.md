---
feature: chain-stock-summary-item-grain
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Tổng hợp nhập xuất tồn kho gộp theo mã hàng

Cùng một SKU (`ABA2777-D-38`), cùng kỳ. Cả hai chế độ đều gộp về **một dòng mỗi mã
hàng**; khác nhau ở cột Vị trí: chi nhánh hiển thị kệ hiện tại của hàng (ưu tiên kho,
không phải kệ ghi trên bút toán), chuỗi không có cột đó.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Chi nhánh: SKU gộp còn 1 dòng, cột Vị trí lấy kệ kho A10 | `/reports/inventory#inventory_in_out_stock_summary` | `fill input[aria-label="Lọc Mã SKU"] = ABA2777-D-38; click button:has-text("Lấy dữ liệu")` | AC-01 | text=Mã vị trí; text=A10; no-text=Mặc định; text=trên 1 kết quả |
| S2 | Chuỗi: cùng SKU 1 dòng, không còn cột vị trí | `/reports/inventory#inventory_in_out_stock_summary` | `click button[aria-haspopup="menu"]; click [role="menuitemradio"]:has-text("Chuỗi cửa hàng"); wait text=Xem theo chuỗi cửa hàng; fill input[aria-label="Lọc Mã SKU"] = ABA2777-D-38` | AC-02 | no-text=Mã vị trí; no-text=Tên vị trí; text=trên 1 kết quả |
| S3 | Thống kê theo Nhóm hàng hóa: chỉ còn cột định danh "Nhóm hàng hóa" | `/reports/inventory#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Hàng hóa"); click .max-h-60 button:has-text("Nhóm hàng hóa"); click button:has-text("Đồng ý")` | AC-03 | text=Nhóm hàng hóa; no-text=Tên hàng hóa; no-text=Mã SKU mẫu mã; no-text=Màu sắc; no-text=Thương hiệu; no-text=trên 0 kết quả |
| S4 | Chuỗi: form lọc không còn dòng "Kho" | `/reports/inventory#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo")` | AC-04 | text=Theo nhóm cửa hàng; no-text=Tất cả kho |

## Not verified here

Số học của phép gộp (chi nhánh HCM 13 + 2 − 8 = 7; chuỗi 8 = HCM 7 + Chi nhánh kiểm thử 1)
đối chiếu trực tiếp với `stock_ledger_entries`. Nhánh dự phòng showroom — hàng chỉ nằm
trên sàn bán thì lấy kệ showroom thay vì để trống — do unit test trong
`stock-summary.report.spec.ts` giữ, vì dữ liệu dev không có ca đó.

## Notes

Tài khoản chạy là admin, sau `post_login` đang ở chi nhánh HCM. S2 và S3 dùng chung
ngữ cảnh trình duyệt nên cờ chuỗi đặt ở S2 còn hiệu lực ở S3.

S3 và S4 chạy tiếp ngữ cảnh chuỗi của S2. Bước mở panel "Chọn báo cáo" phải nằm
CUỐI: panel là popover, nó vẫn mở sang bước sau (goto cùng hash không remount SPA),
nên một bước sau đó bấm "Chọn báo cáo" sẽ đóng panel thay vì mở.

`no-text=trên 0 kết quả` ở S3 canh một lỗi cụ thể: bộ lọc cột "Mã SKU" gõ ở S2 vẫn
nằm trong store sau khi cột đó rời khỏi catalog, và nếu không dọn thì nó thành bộ
lọc vô hình lọc sạch lưới — không còn ô nào để người dùng thấy mà xoá.

`no-text=Mặc định` ở S1 là điểm mấu chốt: trước thay đổi này, ba dòng của SKU gồm hai
dòng "Mặc định" (kệ showroom mà POS trừ hàng). Nếu nó còn xuất hiện thì cột Vị trí vẫn
đang đọc từ bút toán chứ không phải từ kệ hiện tại.
