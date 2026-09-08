---
feature: 2026090801-report-table-single-line-cells
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Ô dữ liệu bảng báo cáo hiện đúng một dòng

Một environment (admin, chế độ "Chuỗi cửa hàng"), một viewport. Mỗi step `goto` lại
trang và store báo cáo không persist, nên step nào cũng tự chọn báo cáo từ bảng lọc.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert | Env |
|---|---|---|---|---|---|---|
| S1 | Tồn kho theo cửa hàng: SKU 140px nằm trên một dòng, chỉ hai ô text có tooltip | `/reports/inventory` | `click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2); click [data-radix-popper-content-wrapper] .max-h-60 > button:has-text("Số lượng tồn kho theo cửa hàng"); click text=Đồng ý; wait table tbody tr:nth-child(5)` | AC-01, AC-04, AC-05 | `text=Mã SKU mẫu mã; text=Tồn theo cửa hàng; no-text=trên 0 kết quả; count table tbody tr:first-child td[title] = 2` | — |
| S2 | Doanh thu theo mặt hàng, tháng trước: cột text 160px, cột số 112px, dòng 32px | `/reports/sales` | `click button[role=combobox]; click text=Tháng trước; click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2); click [data-radix-popper-content-wrapper] .max-h-60 > button:has-text("Doanh thu theo mặt hàng"); click text=Đồng ý; wait table tbody tr:nth-child(5)` | AC-02, AC-03 | `text=Tên hàng hóa; text=DOANH THU THEO MẶT HÀNG; no-text=trên 0 kết quả` | — |
| S3 | Lọc "Giày thể thao" (tên hàng dài nhất của dữ liệu): 50 dòng lọc vẫn một dòng 32px, cột 220px vừa đủ, không dòng nào phình | `/reports/sales` | `click button[role=combobox]; click text=Tháng trước; click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2); click [data-radix-popper-content-wrapper] .max-h-60 > button:has-text("Doanh thu theo mặt hàng"); click text=Đồng ý; wait table tbody tr:nth-child(5); fill :nth-match(table thead input, 2) = Giày thể thao; wait text=AK1109-25-DO-40` | AC-03 | `text=AK1109-25-DO-40; no-text=Áo mưa MT; no-text=trên 0 kết quả` | — |
| S4 | Drill-down từ một tên hàng: lưới trong dialog cùng hành vi | `/reports/sales` | `click button[role=combobox]; click text=Tháng trước; click text=Chọn báo cáo; wait text=Kỳ báo cáo; click :nth-match(button[role=combobox], 2); click [data-radix-popper-content-wrapper] .max-h-60 > button:has-text("Doanh thu theo mặt hàng"); click text=Đồng ý; wait table tbody tr:nth-child(5); click table tbody tr:first-child a; wait [role=dialog] table tbody tr:nth-child(5)` | AC-06 | `text=CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN; text=Số hóa đơn` | — |

## Not verified here

- **AC-07** (backend khai width cho cột định danh dùng chung) — không có bề mặt UI riêng:
  cái nhìn thấy được là S2 (Mã SKU 140 / Tên hàng hóa 220 thay vì 160 fallback), nhưng
  "cùng key cùng width ở cả ba nhóm" và "cột tiền không có width" là hợp đồng giữa ba util
  backend. Phủ bằng `report-core/report-column-widths.spec.ts` (T-01-04), 51 suite
  `modules/reporting` xanh 2026-09-08.
- **Số đo px** (140 / 160 / 112, dòng 32px, `white-space: nowrap`) — assertion của runner
  chỉ có `text` / `no-text` / `count`, không đọc được `getComputedStyle`. Đã đo trực tiếp
  qua DevTools ngày 2026-09-08 (ghi trong `01-assumptions.md` A-05 và ticket T-01-01,
  T-01-02); screenshot S1/S2 là bằng chứng nhìn thấy được của cùng số đo đó.
- **AC-05 vế "header vẫn xuống dòng"** — không có assertion cho "có xuống dòng"; S1 chụp
  header "Tồn theo cửa hàng" / "Chi nhánh Long Xuyên" để người đọc nhìn.
- **Kéo cột bằng tay** (A-05) — cần drag; runner không có verb drag. Đã kéo thủ công
  2026-09-08: "Tên hàng hóa" 220px → 91px, ô nowrap, "Ba lô TX1…" cắt "...", dòng 32px.

## Notes

- S2–S4 lọc về **"Tháng trước"** trước khi chụp: kỳ mặc định "Hôm nay" cho bảng trắng trên
  `erp_dev`. `no-text=trên 0 kết quả` khoá điều đó — kỳ trượt về khoảng rỗng thì step đỏ.
- S1 không cần đổi kỳ: "Số lượng tồn kho theo cửa hàng" là ảnh chụp tồn tại ngày cuối kỳ.
- Ô chọn báo cáo là Popover (`data-radix-popper-content-wrapper`), mục là `<button>`
  thường; trigger là combobox thứ 2 trên trang (thứ 1 là kỳ ở thanh công cụ).
- Kỳ được chọn ở **thanh công cụ trước khi mở bảng lọc** (`click button[role=combobox]` khi
  bảng lọc đang đóng chỉ khớp đúng ô kỳ), rồi bảng lọc kế thừa "Tháng trước" cho báo cáo
  vừa chọn. Bản đầu chọn kỳ trong bảng lọc bằng `:nth-match(button[role=combobox], 3)` và
  đỏ cả ba step: sau khi đổi sang "Doanh thu theo mặt hàng" bảng lọc thêm dòng nên combobox
  thứ 3 không còn là "Kỳ báo cáo".
- S3 gõ vào ô lọc cột thứ 2 của hàng lọc (`:nth-match(table thead input, 2)` = "Tên hàng
  hóa", ngay sau "Mã SKU" ghim trái). Không dùng `input[aria-label="Lọc Tên hàng hóa"]`:
  runner tách verb `fill` ở dấu `=` đầu tiên nên selector có `=` bị cắt cụt.
- S3 chờ `AK1109-25-DO-40` — SKU đầu tiên của tập lọc "Giày thể thao" (324 dòng ở tháng
  8/2026), **không có** trên trang 1 chưa lọc (trang đó toàn AOM / TX…). Bản đầu lọc "Ba lô
  đeo vai" và chờ `TX2024-N`: mã đó đã nằm sẵn ở dòng 10 chưa lọc nên step xanh trước khi
  refetch xong, ảnh chụp là bảng CHƯA lọc (pager vẫn 4007). `no-text=Áo mưa MT` khoá luôn:
  dòng 1 chưa lọc còn đó thì step đỏ.
- **Ảnh S3 không có dấu "..."**, và đó là sự thật của dữ liệu chứ không phải lỗi: tên dài
  nhất trong `items` của org MT là 32 ký tự với 3 dấu cách liền (`Giày thể thao   AK…`),
  HTML gộp còn 29 ký tự ≈ 197px, vừa lọt 204px nội dung của cột 220px. Bằng chứng cắt "..."
  là kéo cột thủ công xuống 91px (A-05, mục Not verified here) — runner không có verb drag.
- Chỉ viewport `desktop`: refresh token dùng một lần nên context viewport thứ hai bị đá
  về đăng nhập (xem ghi chú ở `2026090404-report-permissions/07-verification.md`).
