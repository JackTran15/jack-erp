---
id: UOW-04
slug: import
title: Nhập khẩu Excel vào lưới giảm giá hàng hóa (gộp theo mã)
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22]
risk: medium
status: todo
rollback: revert T-04-01..T-04-04 — endpoint, dialog và nút biến mất; không có migration
---

# UOW-04 — Nhập khẩu Excel vào lưới giảm giá hàng hóa (gộp theo mã)

## Demo script
1. Lưới có `SKU-685`=30, `SKU-300`=15
2. Bấm **Nhập khẩu**, chọn file có `SKU-685`=50, `SKU-100`=10, một mã không tồn tại, một dòng `%`=120
3. Dialog liệt kê 2 dòng lỗi (số dòng Excel + lý do), 2 dòng hợp lệ
4. Bấm **Áp dụng** → lưới: `SKU-685`=50, `SKU-300`=15, `SKU-100`=10, dòng trống vẫn ở cuối
5. Chưa bấm **Lưu** → DB chưa đổi; bấm **Lưu** → đổi
6. Xuất khẩu rồi nhập lại chính file đó → 0 lỗi, lưới không đổi

## In scope
- `ItemDiscountWorkbook.parse`
- `POST /v2/promotions/item-discount-lines/import`
- `ItemDiscountImportDialog` + gộp vào lưới

## Not in scope
- Job nền / >2.000 dòng (ADR-01)
- `.xls` (A-17)
- Phạm vi *Nhóm hàng hóa* (A-02)

## Risks
| Risk | Mitigation |
| --- | --- |
| Tra mã không phân biệt hoa thường chậm với 2.000 mã | Một truy vấn `LOWER(code) IN (...)` theo org cho items, một cho products; không truy vấn theo từng dòng |
| Người dùng tưởng nhập khẩu đã lưu | Dialog ghi rõ *"Các dòng sẽ được thêm vào bảng. Bấm Lưu để lưu chương trình."*; AC-22 |

## Definition of done
- [x] AC-14..AC-20 xanh (unit + `promotion-item-discount-import.e2e-spec.ts`)
- [x] **(trước khi merge)** AC-21/AC-22 có ảnh chụp trình duyệt trong `07-verification.md`
- [x] `openapi.snapshot.json` + `schema.ts` được sinh lại, không sửa tay
- [x] Không file nào ngoài `touches:` bị đụng
