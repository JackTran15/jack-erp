---
id: UOW-02
slug: table-row-contrast
title: Tương phản dòng bảng — sọc trắng/xám, hover xanh, chọn tím, kể cả cột ghim
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-15, AC-16, AC-17, AC-18]
risk: low
status: todo
rollback: revert T-02-01..T-02-04 — chỉ CSS/frontend
---

# UOW-02 — Tương phản dòng bảng

## Demo script
1. Mở *Phiếu nhập kho* (danh sách): sọc trắng/xám phân biệt rõ, cột ghim cùng màu sọc
2. Rê chuột lên một dòng → cả dòng xanh, kể cả cột ghim
3. Bấm chọn một dòng → tím (viền trái tím đậm); rê chuột lên dòng đó vẫn tím
4. Lặp ở *Đơn hàng* và *Quản lý vai trò*
5. Mở CTKM *Giảm giá hàng hóa* (LineItemGrid) → sọc/hover giống bảng danh sách
6. Đổi theme *dark* và *classic* → ba trạng thái vẫn phân biệt được

## In scope
- 5 token × 3 theme, tailwind map
- `BaseDataTable`: `--row-bg`, cột ghim, prop `isRowSelected`
- 7 trang + *Quản lý vai trò* chuyển sang `isRowSelected`
- `LineItemGrid` sọc/hover

## Not in scope
- ~12 bảng/popup tự viết `<table>`; pos-web (A-08)

## Risks
| Risk | Mitigation |
| --- | --- |
| Màu A-09 không hợp mắt client | Ảnh trước/sau gửi duyệt trước khi accept; chỉ đổi token |
| Trang truyền `rowClassName` màu nền khác (cảnh báo) bị đè | `rowClassName` vẫn merge sau cùng; chỉ trạng thái chọn chuyển sang prop |

## Definition of done
- [x] AC-15..AC-18 có ảnh trước/sau (theme misa, `uow-02-before/` vs `uow-02/`, kèm màu đo từ DOM) + ảnh theme dark trong `07-verification.md`
- [x] Không còn `bg-info/15` / `FOCUSED_ROW_BG` / `HOVER_ROW_BG` làm màu dòng chọn ở 7 trang
- [x] `pnpm --filter @erp/backoffice-web build` xanh

### Trước merge
- [ ] AC-16/AC-17 trên cột ghim **thật** (màn *Đơn hàng*) và dòng chọn ở *Đơn mua hàng* / *Đơn hàng* với dữ liệu — local không có đơn; hiện chỉ có mô phỏng cột ghim trên danh mục Hàng hoá (T-02-02, T-02-03 đã tick kèm ghi chú)
- [ ] Ảnh *Phiếu nhập kho* (box T-02-02) — đã chụp danh mục Hàng hoá thay vì Nhập hàng vì tháng này trống
- [ ] Chấp nhận box T-02-04 "`pnpm --filter @erp/ui build`": package không có script build (dùng từ source)
- [ ] Client duyệt màu A-09 qua ảnh `uow-02/` trước khi merge
