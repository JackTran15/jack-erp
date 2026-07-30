---
id: UOW-03
slug: product-template-grain
title: Nhãn grain Mẫu mã trên dòng tham số đúng nghĩa
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-17, AC-18]
risk: low
status: todo
rollback: revert 1 commit
---

# UOW-03 — Nhãn grain "Mẫu mã" trên dòng tham số đúng nghĩa

> **Sửa 2026-07-30 (reopen G2):** UoW này ban đầu gồm 2 ticket — sửa FE (nghi bug 400) +
> sửa nhãn BE. Ticket sửa FE (T-03-01) đã bị xóa: kiểm lại code cho thấy `revenue-by-item`
> gửi `statBy` đúng `item|parent|group` sẵn qua `STAT_BY_OPTIONS`, không hề 400. Chi tiết
> ở A-20 (`01-assumptions.md`) và ADR-04 (`03-logical-design.md`, superseded). UoW giờ chỉ
> còn phần nhãn BE thật sự sai.

## Demo script

1. Mở **Chuỗi cửa hàng → Báo cáo → Doanh thu theo mặt hàng**
2. Đặt "Thống kê theo" = `Mẫu mã` → bảng load 200, các dòng gộp theo sản phẩm cha
   (`Mã SKU` là `ABA2777`, không phải `ABA2777-D-38`) — **đã đúng từ trước**, không đổi gì
3. Bấm Xuất khẩu ở grain `Mẫu mã`, mở file:
   - **Trước UOW này:** dòng tham số ghi sai `Thống kê theo: Hàng hóa`
   - **Sau UOW này:** dòng tham số ghi đúng `Thống kê theo: Mẫu mã`
4. Đổi "Thống kê theo" = `Hàng hóa`, xuất lại → dòng tham số ghi đúng
   `Thống kê theo: Hàng hóa` (trước UOW này bị ghi sai thành `Mẫu mã`)

## In scope

- Đảo `GROUP_BY_LABELS_VI` trong export handler cho khớp nghĩa của `resolveGrain`

## Not in scope

- Sửa FE — không có gì để sửa, `STAT_BY_OPTIONS` đã đúng (A-20)
- Nhận `"productTemplate"` như alias ở BE — chuỗi đó không liên quan báo cáo này
- Đổi enum `ReportGroupBy` — đang đúng
- Dòng tham số đầy đủ kiểu MISA — UOW-04; ở đây chỉ sửa nhãn grain trong dòng hiện có

## Risks

| Risk | Mitigation |
|---|---|
| `GROUP_BY_LABELS_VI` đảo sai chiều lần nữa | Bằng chứng chiều đúng nằm trong code: `resolveGrain` map `PARENT`→`'parent'`, `dimensionOf('parent')` gộp theo `productId`, và comment `buildColumns` gọi `statBy=item` là `"Hàng hoá"`. T-03-02 khẳng định bằng test, không bằng suy luận |
| Ai đó đọc lại discovery cũ và tưởng cần sửa FE | Ghi rõ trong intent, assumption A-20, và ADR-04 (superseded) — 3 chỗ trỏ về nhau |

## Definition of done

- [x] AC-17, AC-18 pass
- [x] Chọn `Mẫu mã` trên UI thật trả 200 và gộp đúng — xác nhận trực tiếp trên trình duyệt (T-05-02): 200, dòng gộp theo mã mẫu mã (ABA2777...), không còn mã biến thể
- [x] `pnpm --filter @erp/api test` xanh
- [x] Demoed và accepted ở gate G4 — solo, `done --no-review`
