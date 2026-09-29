---
id: UOW-02
slug: workbook-sheets
title: File Excel 3 sheet cho nhập/xuất, có Đồng giá
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-04]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19]
risk: medium
status: todo
rollback: revert T-02-01..T-02-03 — endpoint quay về 1 sheet; không có migration
---

# UOW-02 — File Excel 3 sheet cho nhập/xuất, có Đồng giá

## Demo script
1. Form *Giảm giá hàng hóa*, *%*, `SKU-685`=30, `SKU-100`=10 → **Xuất khẩu** (nút đã có)
2. Mở file: 3 sheet `Giảm giá theo %` / `Giảm giá theo số tiền` / `Đồng giá`; sheet `%` có 2 dòng, cột `Mã SKU* | Tên hàng hóa | % giảm giá`; hai sheet kia chỉ tiêu đề
3. Ghi `SKU-200`=20000 vào sheet `số tiền`, chuyển form sang *Số tiền*, **Nhập khẩu** file đó → chỉ `SKU-200` vào lưới
4. Nhập lại một file 1 sheet đã xuất hôm qua ở *%* → vẫn nhập được
5. Swagger: `POST .../export` với `method=FIXED_PRICE` → sheet `Đồng giá` có mã + tên

## In scope
- `ITEM_DISCOUNT_SHEETS`, `build` 3 sheet, `parse` chọn sheet (ADR-01, ADR-02)
- DTO + handler nhận `FIXED_PRICE`; kết quả nhập có `unit`, `sellingPrice`
- Cập nhật e2e + sinh lại OpenAPI

## Not in scope
- Nút ở *Đồng giá*, link file mẫu, gộp ĐVT/giá vào lưới (UOW-03)

## Risks
| Risk | Mitigation |
| --- | --- |
| e2e cũ khẳng định bố cục 6 cột / 1 sheet | T-02-03 sửa các khẳng định đó thành bố cục mới; giữ riêng một case file 1 sheet cho AC-18 |
| Tên sheet có `%` bị exceljs / Excel từ chối | Spec T-02-01 dựng rồi đọc lại file; mở thử bằng Numbers/Excel khi verify |
| e2e red vì outbox relay (memory `e2e-outbox-relay-race`) | Chạy với `OUTBOX_RELAY_DISABLED=1` |

## Definition of done
- [x] Unit spec workbook + hai handler xanh
- [x] `promotion-item-discount-export/import.e2e-spec.ts` xanh
- [x] `openapi.snapshot.json` + `schema.ts` sinh lại, không sửa tay
- [x] Không file nào ngoài `touches:` bị đụng
