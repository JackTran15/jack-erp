---
feature: 2026090802-stock-transfer-print-export
environments: [local-backoffice-wh]
viewports: [desktop]
---

# Verification — In / Xuất khẩu phiếu chuyển kho

Chạy bằng tài khoản **Nhân viên kho** (`local-backoffice-wh`): đúng persona Thủ kho, có
`inventory.transfer.read`, không cần chuyển chi nhánh sau đăng nhập. Trang mặc định lọc kỳ
"Tháng này" và tháng 9/2026 chưa có phiếu ở chi nhánh MT46, nên mỗi bước chuyển kỳ sang
"Tháng trước" trước (đổi kỳ tự nạp lại danh sách — `useEffect` theo `period.from/to`, không cần
bấm "Lấy dữ liệu"). Dialog phiếu mở bằng nút số phiếu ở dòng đầu tiên (`button[title^="CK"]`),
nên bước không phụ thuộc một số phiếu cụ thể.

Nút **In** không bấm trong phiên tự động: `printHtmlDocument` gọi `window.print()` trên iframe ẩn
và hộp thoại in của trình duyệt làm treo Playwright (tiền lệ
`transfer-receipt-cross-branch-reference`). Nút **Xuất khẩu** bấm được: Chromium headless nhận sự
kiện download rồi bỏ qua, chỉ cần không có toast lỗi.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách Chuyển kho (kỳ Tháng trước) có phiếu đã ghi sổ | `/inventory/stock-transfers` | `click button[role="combobox"]:has-text("Tháng này"); click button:has-text("Tháng trước"); wait table tbody tr:first-child button[title^="CK"]` | AC-07 | `count table tbody tr:first-child button[title^="CK"] = 1` |
| S2 | Mở phiếu đã lưu: hai nút In và Xuất khẩu trên thanh công cụ dialog được bật | `/inventory/stock-transfers` | `click button[role="combobox"]:has-text("Tháng này"); click button:has-text("Tháng trước"); wait table tbody tr:first-child button[title^="CK"]; click table tbody tr:first-child button[title^="CK"]; wait [role="dialog"]:has-text("Phiếu chuyển kho CK")` | AC-07 | `text=Phiếu chuyển kho CK; count [role="dialog"] [role="toolbar"] button:has-text("In"):not([disabled]) = 1; count [role="dialog"] [role="toolbar"] button:has-text("Xuất khẩu"):not([disabled]) = 1` |
| S3 | Bấm Xuất khẩu trên phiếu đã lưu: file tải về, không có toast lỗi, nút mở khóa lại | `/inventory/stock-transfers` | `click button[role="combobox"]:has-text("Tháng này"); click button:has-text("Tháng trước"); wait table tbody tr:first-child button[title^="CK"]; click table tbody tr:first-child button[title^="CK"]; wait [role="dialog"]:has-text("Phiếu chuyển kho CK"); click [role="dialog"] [role="toolbar"] button:has-text("Xuất khẩu"); wait [role="dialog"] [role="toolbar"] button:has-text("Xuất khẩu"):not([disabled])` | AC-08 | `no-text=Không tìm thấy dữ liệu.; no-text=Chứng từ chưa hỗ trợ xuất khẩu; count [role="dialog"] [role="toolbar"] button:has-text("Xuất khẩu"):not([disabled]) = 1` |
| S4 | Thêm mới: hai nút In và Xuất khẩu bị tắt | `/inventory/stock-transfers` | `click [role="toolbar"][aria-label="Hành động trang"] button:has-text("Thêm mới"); wait [role="dialog"]:has-text("Thêm mới phiếu chuyển kho")` | AC-07 | `text=Thêm mới phiếu chuyển kho; count [role="dialog"] [role="toolbar"] button:disabled:has-text("In") = 1; count [role="dialog"] [role="toolbar"] button:disabled:has-text("Xuất khẩu") = 1` |

## Not verified here

- **AC-01, AC-02, AC-03** (nội dung payload): unit test `stock-transfer-print.mapper.spec.ts`
  (T-01-02) và `curl` route `print-payload` trên dev — kết quả JSON lưu ở
  `evidence/manual/print-payload.json`.
- **AC-04** (file Excel): `curl` route `export` trên dev → `evidence/manual/phieu-chuyen-kho.xlsx`,
  header `Content-Type`/`Content-Disposition` lưu ở `evidence/manual/export-headers.txt`; file mở
  bằng openpyxl, cấu trúc đối chiếu với `XuatKhauChuyenKho.xlsx` (MISA).
- **AC-05, AC-06** (cách ly org / chỉ scope org): e2e `voucher-print-payload.e2e-spec.ts` (T-01-05).
- **AC-08, phần In**: không bấm được trong Playwright (xem trên). Bản in được kiểm bằng cách render
  payload thật (`evidence/manual/print-payload.json`) qua chính `renderVoucherHtml` của backoffice →
  `evidence/manual/print-preview.html`, chụp ở bề rộng A4 (794px, media print) →
  `evidence/manual/print-preview.png` và in ra `evidence/manual/print-preview.pdf` (Chromium, A4,
  lề 10mm) để đối chiếu với file mẫu MISA.

## Notes

- Bộ e2e ở môi trường này khởi động rất chậm (`synchronize(true)` dựng lại toàn bộ schema, ~3 phút)
  và chạm trần `jest.setTimeout(180_000)` khi máy đang bận (dev API + Vite + Playwright). Chạy
  `voucher-print-payload` một mình, không chạy song song với verify. Suite `transfer-order.e2e-spec`
  chưa sửa gì cũng đỏ ở HEAD (400 khi tạo phiếu) — lỗi môi trường có sẵn, không thuộc feature này.
- Runner của ai-dlc-verify không khớp `button:text-is("…")` (0 kết quả dù nút hiện rõ); dùng
  `[role="toolbar"] button:has-text("…")` như các feature trước.

Tài khoản `local-backoffice-wh` thuộc 2 chi nhánh (MT46 Đà Nẵng, MT211 Đà Nẵng), cả hai đều có
hàng trăm phiếu chuyển kho POSTED có Đối tượng, nên S1 luôn có dòng để mở dù đăng nhập rơi vào
chi nhánh nào.
