---
id: UOW-05
slug: misa-file-reconciliation
title: Đối chiếu file thật với export MISA
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02, UOW-03, UOW-04]
requirements: [US-05]
verifies: [AC-01, AC-04, AC-06, AC-08, AC-12, AC-17]
risk: low
status: todo
rollback: không có gì để rollback — UoW này chỉ thêm test và một ghi chú đối chiếu
---

# UOW-05 — Đối chiếu file thật với export MISA

## Demo script

1. Chạy `pnpm --filter @erp/api test` → xanh, gồm snapshot workbook mới của T-05-01
2. Khởi động API + backoffice, mở **Doanh thu theo mặt hàng**
3. Đặt đúng tham số của ảnh #2: kỳ `01/01/2026 – 31/12/2026`, một cửa hàng,
   "Thống kê theo" = `Mẫu mã`
4. Bấm Xuất khẩu, mở file cạnh ảnh #2 và soát:
   - 14 tiêu đề cột A→N khớp từng chữ
   - ô `G` có `Đơn giá TB` + `(2)=(3)/(1)` trên 2 dòng
   - cột `D`/`E` có tiêu đề, ô dữ liệu trống
   - dòng tham số có đủ 6 phần, `Thống kê theo: Mẫu mã`
   - dòng tổng cuối: `Số lượng bán`, `Tiền hàng`, `Khuyến mại`, `Điểm KM`, `Doanh thu` có số;
     `Đơn giá TB` và `Tỷ lệ KM (%)` để trống (trung bình và tỷ lệ không có tổng)
5. Ghi kết quả đối chiếu (kèm số tổng) vào ghi chú của T-05-02

## In scope

- Một snapshot test ghi rồi đọc lại workbook thật, khẳng định 14 header + ký hiệu + dòng
  tham số trong một lần chạy
- Một lần đối chiếu tay trên file thật với ảnh #2, có ghi chú kết quả

## Not in scope

- Đối chiếu **giá trị từng ô** với MISA — dữ liệu 2 hệ thống khác nhau; đối chiếu là về
  layout, cộng một lần so tổng để phát hiện lệch có hệ thống (A-01)
- E2E tự động — không dựng suite mới cho một báo cáo

## Risks

| Risk | Mitigation |
|---|---|
| 4 UoW xanh riêng lẻ nhưng file ghép lại vẫn lệch | Chính là lý do UoW này tồn tại: một test đi hết đường catalog → payload → workbook |
| Số tổng lệch MISA có hệ thống ⇒ A-01 sai | T-05-02 so tổng; nếu lệch thì `aidlc reopen G2` với lý do, đừng vá layout cho khớp |

## Definition of done

- [~] AC-01, AC-04, AC-06, AC-08, AC-12, AC-17 pass trên đường đi thật — AC-01/04/06/17 xác nhận đầy đủ trên UI thật với dữ liệu seed thật; AC-08/AC-12 xác nhận một phần (test tự động qua workbook thật + xác nhận trên màn hình, chưa qua file tải thật) — xem `07-reconciliation-note.md`
- [x] `pnpm --filter @erp/api test` và `pnpm --filter @erp/backoffice-web build` xanh — 203 suites/1703 passed; build OK
- [x] Ghi chú đối chiếu đã viết, có kết luận về A-01 — đúng về logic, số liệu seed không đủ để kiểm thực nghiệm đầy đủ (Khuyến mại/Điểm KM đều 0)
- [x] Demoed và accepted ở gate G4 — solo, `done --no-review`
