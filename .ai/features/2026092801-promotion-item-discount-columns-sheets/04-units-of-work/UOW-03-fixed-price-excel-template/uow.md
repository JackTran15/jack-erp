---
id: UOW-03
slug: fixed-price-excel-template
title: Nhập/Xuất khẩu ở Đồng giá + link Tải file mẫu
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-02, US-03, US-04]
verifies: [AC-06, AC-11, AC-14, AC-16]
risk: low
status: todo
rollback: revert T-03-01..T-03-02 — nút ở Đồng giá và link file mẫu biến mất
---

# UOW-03 — Nhập/Xuất khẩu ở Đồng giá + link Tải file mẫu

## Demo script
1. Form *Giảm giá hàng hóa*, phạm vi *Hàng hóa*, *Đồng giá* 50.000 → hai nút **Nhập khẩu / Xuất khẩu** hiện
2. Bấm **Nhập khẩu** → dialog có link **Tải file mẫu** → tải file 3 sheet chỉ tiêu đề
3. Điền 3 mã vào sheet `Đồng giá` (một mã đã có trong lưới, một mã sai), nhập → dialog báo 1 lỗi; áp dụng → thêm 1 dòng mới có ĐVT/Giá bán, Giá KM 50.000; dòng đã có không đổi
4. **Xuất khẩu** → sheet `Đồng giá` có đủ mã + tên
5. Chuyển phạm vi *Nhóm hàng hóa* → hai nút ẩn

## In scope
- `excelEnabled` / `excelMethod` cho 3 phương thức; kiểu API FE
- Link **Tải file mẫu** trong dialog
- `applyImported` điền `unit`/`sellingPrice`, không đụng `value` khi Đồng giá

## Not in scope
- Nhập/Xuất ở *Nhóm hàng hóa*

## Risks
| Risk | Mitigation |
| --- | --- |
| Verify ghi DB qua `:3000` trỏ vào `erp_clone_prod` | Verify trên env `local-backoffice-erp2` (:3010 → API erp2) |

## Definition of done
- [x] AC-06 (nhập khẩu), AC-11, AC-14, AC-16 có ảnh chụp trong `07-verification.md`
- [x] tsc xanh
- [x] Không file nào ngoài `touches:` bị đụng
