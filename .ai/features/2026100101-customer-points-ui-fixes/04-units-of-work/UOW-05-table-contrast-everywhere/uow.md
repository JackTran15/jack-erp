---
id: UOW-05
slug: table-contrast-everywhere
title: Tương phản dòng trên mọi bảng backoffice — báo cáo, trang có cột chọn, bảng tự viết
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-06]
verifies: [AC-22, AC-23, AC-24, AC-25]
risk: medium
status: todo
rollback: revert T-05-01..T-05-10 — chỉ CSS/frontend
---

# UOW-05 — Mọi bảng backoffice (trừ POS)

Mở lại G3 ngày 2026-10-01 theo yêu cầu Akenzy: "sửa tất cả table trừ phía POS".

## Demo script
1. Mở một báo cáo (vd *Báo cáo → Bán hàng*): sọc trắng/xám, hover xanh cả cột ghim
2. Danh mục *Hàng hoá*: tick 2 dòng → cả 2 tím; bỏ tick → về sọc
3. *Khuyến mãi → Chương trình KM*: tick một dòng → tím
4. Mở popup tra cứu hàng (ô tìm mã trong một phiếu): sọc + dòng đang trỏ tím
5. *Đơn hàng*: panel chi tiết dòng hàng có sọc/hover
6. CTKM *Tặng hàng*: lưới hàng tặng có sọc/hover
7. *Quỹ tiền → Phiếu thu*: panel chi tiết có sọc/hover
8. Chạy `table-contrast-coverage.test.ts` → xanh, in danh sách bảng được miễn (nếu có)

## In scope
- `.erp-data-table` + test quét
- `ReportPageTableView`
- `isRowSelected` cho 19 trang `BaseDataTable` có cột chọn chưa tô
- ~53 file `<table>` tự viết, chia 5 nhóm

## Not in scope
- pos-web; mẫu in `lib/print/` (A-20)

## Risks
| Risk | Mitigation |
| --- | --- |
| Bỏ class tô cũ làm mất chỉ báo khác (cảnh báo đỏ, dòng lỗi) | Chỉ bỏ class sọc/hover/chọn; class trạng thái (`text-destructive`, `bg-destructive-subtle`…) giữ nguyên và vẫn thắng nhờ merge sau |
| Bảng nằm trong dialog có nền riêng | Ảnh đại diện mỗi nhóm (AC-25) |
| Ô sticky trong bảng tự viết bị trong suốt | Quy tắc A-21 trong từng ticket |

## Definition of done
- [x] AC-24 xanh: `table-contrast-coverage.test.ts`
- [x] AC-22, AC-23, AC-25 có ảnh + màu đo DOM trong `07-verification.md`
- [x] `pnpm --filter @erp/backoffice-web build` xanh

### Trước merge
- [ ] Code chưa commit — agent không được commit (hook); người merge commit
