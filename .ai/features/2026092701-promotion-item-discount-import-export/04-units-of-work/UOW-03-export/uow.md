---
id: UOW-03
slug: export
title: Xuất khẩu danh sách giảm giá hàng hóa ra Excel
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-09, AC-10, AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: revert T-03-01..T-03-04 — endpoint và nút biến mất; không có migration
---

# UOW-03 — Xuất khẩu danh sách giảm giá hàng hóa ra Excel

## Demo script
1. Form *Giảm giá hàng hóa*, phạm vi *Hàng hóa*, *%*: `SKU-685`=30, `SKU-100`=10 (chưa cần lưu)
2. Bấm **Xuất khẩu** ở hàng *Thiết lập* → tải `GiamGiaHangHoa.xlsx`
3. Mở file: tiêu đề `Mã SKU* | Tên hàng hóa | Đơn vị tính | Giá bán | % giảm giá | Giá khuyến mại`; `SKU-685` giá KM **479.500**
4. Xoá hết dòng → **Xuất khẩu** → file mẫu chỉ có tiêu đề
5. Chọn *Đồng giá* hoặc phạm vi *Nhóm hàng hóa* → hai nút bị ẩn

## In scope
- `ItemDiscountWorkbook` (định nghĩa cột + `build`)
- `POST /v2/promotions/item-discount-lines/export`
- Nút **Xuất khẩu** trên lưới

## Not in scope
- Cột ĐVT/Giá bán/Giá KM trên lưới (A-03)
- Xuất theo `programId` đã lưu (A-15)

## Risks
| Risk | Mitigation |
| --- | --- |
| Trả file nhị phân qua Nest bị interceptor JSON bọc lại | Dùng `StreamableFile` + header như `csv-export.controller.ts`; e2e đọc lại buffer bằng exceljs |
| openapi generator sinh sai kiểu cho response nhị phân | FE gọi bằng `responseType: 'blob'` như `export-barcode-labels.api.ts`, không dựa vào kiểu sinh |

## Definition of done
- [x] AC-09..AC-12 xanh (unit + `promotion-item-discount-export.e2e-spec.ts`)
- [x] **(trước khi merge)** AC-09/AC-13 có ảnh chụp trình duyệt trong `07-verification.md`
- [x] `openapi.snapshot.json` + `schema.ts` được sinh lại, không sửa tay
- [x] Không file nào ngoài `touches:` bị đụng
