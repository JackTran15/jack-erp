---
id: UOW-01
slug: invoice-number-issued
title: Hệ thống cấp số hoá đơn theo YYMMDDxxxx và YYMMDDxxxxTH
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: high
status: todo
rollback: "`pnpm migration:revert` hai lần — rule về `INV`/`RTN` + `YYYYMM` + 5 + `MONTHLY`, cột `separator` bị bỏ. Mã đã cấp theo định dạng mới giữ nguyên trong `invoices.code`: đây là số nội bộ, chưa có tích hợp hoá đơn điện tử (A-08), nên hai định dạng cùng tồn tại là hợp lệ và không phải dọn dữ liệu."
---

# UOW-01 — Hệ thống cấp số hoá đơn theo YYMMDDxxxx và YYMMDDxxxxTH

## Demo script

1. Đăng nhập POS chi nhánh có hàng, bán một món bất kỳ, thanh toán tiền mặt
2. Mở **Danh sách hóa đơn** → hoá đơn vừa lập mang mã dạng `2608220001` (không tiền tố,
   không dấu gạch)
3. Bán thêm một đơn nữa → mã kế tiếp là `2608220002`
4. Vào **Đổi trả hàng**, chọn hoá đơn ở bước 1, trả một món, hoàn tất
5. Phiếu trả vừa lập mang mã `2608220001TH` — số thứ tự của nó **bắt đầu lại từ 1**, chứng tỏ
   hai dải số độc lập, và hậu tố `TH` là thứ tách chúng
6. Mở **Cấu hình → Đánh số chứng từ**, xem rule "Phiếu thu" vẫn là `PT`, rule "Nhập kho" vẫn
   là `IMP` — không loại chứng từ nào khác bị ảnh hưởng
7. Lập một phiếu thu tiền mặt → mã vẫn là `PT0000xx` như trước
8. Mở lại một hoá đơn cũ (`INV-202608-00013`) trong danh sách → mã vẫn nguyên vẹn

## In scope

- Cột `separator` trên `document_number_rules` và việc bộ dựng số dùng nó
- Token ngày `YYMMDD`
- Cấu hình lại rule `INVOICE` và `RETURN` bằng migration, cho mọi organization
- Cả **hai** bản sao của bộ định dạng (service và saga) — xem ADR-05

## Not in scope

- Số in trên phiếu giấy (UOW-02) — UoW này chỉ lo mã trong hệ thống
- Màn cấu hình đánh số (UOW-03)
- 26 loại chứng từ còn lại (A-04)
- Viết lại mã hoá đơn cũ (A-05)

## Risks

| Risk | Mitigation |
|---|---|
| Sửa `formatDocumentNumber` làm đổi mã của 26 loại chứng từ khác | `separator` mặc định `'-'` + nhánh tắt `!includeDate && !suffix` giữ nguyên; T-01-02 khoá lại bằng ma trận hồi quy trên các rule đang có thật |
| Sửa sót một trong hai bản sao → đơn bán và đơn trả ra hai định dạng khác nhau (ADR-05) | T-01-02 sửa cả hai trong một ticket và mở rộng chính bộ test chống drift đã có |
| Org có rule INVOICE/RETURN theo chi nhánh → 23505 ngay tại quầy (A-02, ADR-06) | T-01-04 cho migration `RAISE EXCEPTION` thay vì âm thầm cập nhật |
| Rule đổi nhưng bộ đếm cũ còn treo ở `resetKey` cũ | ADR-02: `resetKey` chuyển từ `2026-08` sang `2026-08-22`, hàng cũ trở thành vô hại, không phải dọn |

## Definition of done

- [x] AC-01..AC-09 pass (unit-verified; click-through thật ở G4)
- [x] `pnpm --filter @erp/api test` xanh — 280 suite, 2878 test, gồm cả `document-number-format.spec.ts`
- [x] Ma trận hồi quy phủ 18 hàng rule trên `erp_dev` (16 hình dạng phân biệt — `CASH_RECEIPT` và `WAREHOUSE` mỗi loại có 2 hàng trùng hình dạng), khẳng định chuỗi đầy đủ
- [x] `pnpm migration:run` / `migration:revert` chạy sạch cả hai migration trên `erp_dev`
- [x] Không có `UPDATE invoices SET code` — 66 hoá đơn mã cũ còn nguyên sau khi chạy migration
- [x] Demoed và accepted ở gate G4 — click-through thật trên `erp2`, `erp_dev` thật, POS `:3001`
      + Backoffice `:3000`: bán ở Hà Nội ra `2608240001` rồi `2608240003`/`2608240004`/`2608240005`
      (đúng dạng, không tiền tố/gạch, tăng dần); Đổi trả hàng chọn `2608240001`, trả 1 món →
      phiếu trả ra `2608240001TH` (dải riêng, bắt đầu lại từ 1); danh sách hoá đơn tìm thấy cả
      bốn số ở màn Đổi trả. Backoffice → Cấu hình → Đánh số chứng từ: rule `Phiếu thu tiền mặt`
      vẫn `PT000000`, `Phiếu nhập kho` vẫn `IMP000000`, và 12 loại chứng từ khác không đổi.
      `INV-202608-00013`/`RTN-202608-00002` (hoá đơn cũ) vẫn nguyên mã. Accepted bởi Akenzy, 2026-08-24
