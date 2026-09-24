---
id: UOW-01
slug: open-voucher-from-report
title: Bấm Số chứng từ trên 5 báo cáo Quỹ tiền mở dialog xem phiếu của Sổ quỹ
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: low
status: todo
rollback: Revert các commit của UoW; xoá hai mục `documentNumber` trong `DRILL_DOWNS` là đủ tắt link, không đụng dữ liệu hay backend.
---

# UOW-01 — Mở phiếu từ Số chứng từ

## Demo script

Backoffice erp3 trên Vite :3005 (memory "Backoffice :3000 serves erp2"), API :4000 trên
erp_dev_3008, tài khoản admin của My Company.

1. Báo cáo → Quỹ tiền → **Bảng kê thu chi**, Cửa hàng = Tất cả, kỳ = Năm nay, Phương thức =
   Tất cả. Số chứng từ tô xanh ở mọi dòng chứng từ; dòng "Số dư đầu kỳ" không tô (AC-03).
2. Bấm một Phiếu thu, một Phiếu chi, một Thu tiền gửi, một Chi tiền gửi → mỗi lần mở đúng
   dialog Sổ quỹ tương ứng, cùng số chứng từ / ngày / tổng tiền với dòng; chỉ có In, Xuất
   khẩu, Đóng (AC-01). Chọn một phiếu thuộc chi nhánh khác header → mở bình thường (AC-05).
3. Trong dialog phiếu thu bán hàng bấm mã hóa đơn nguồn → "Chi tiết hóa đơn" mở (AC-07).
4. **Bảng kê tiền chi theo mục chi**: bấm Số chứng từ dòng chi tiết → dialog phiếu chi; dòng
   TỔNG CHI / dòng nhóm không bấm được (AC-02).
5. **Tình hình thu chi** → ô Tiền mặt dòng IV → trong dialog Bảng kê thu chi bấm Số chứng từ →
   dialog phiếu chồng lên; Đóng → về dialog drill-down. Lặp với **Chi tiền theo mục chi** →
   Mục chi và **Chi tiền theo thời gian** → Ngày (AC-04).
6. Đăng nhập tài khoản có `reporting.cash.read` nhưng không có `accounting.cash_payment.read`
   → Số chứng từ các Phiếu chi là text, các loại khác vẫn bấm được (AC-06).

## In scope

- Store `detailVoucher`, `DrillDownAction.voucherDetail`, `DrillDownContext.can`, resolver
  `documentNumber` cho `cash-in-out-list` và `expense-list-by-category`.
- `ReportVoucherDetailDialog` + mount ở `ReportPage` và `ReportDrillDownDialog`.

## Not in scope

- Số hóa đơn / Tham chiếu (UOW-02).
- Nút Sửa trong dialog (A-02).

## Risks

| Risk | Mitigation |
| --- | --- |
| Dialog Sổ quỹ tự gọi thêm API (đối tượng, nhân viên, công nợ) cần quyền khác | Chế độ VIEW chỉ tra cứu hiển thị; T-01-02 chạy thử với tài khoản quyền hẹp ở bước 6, ghi lỗi 403 phụ nếu có |
| z-index dialog phiếu dưới dialog drill-down | `AppModal` xếp stack ở module scope (comment `ReportDrillDownDialog.tsx`); kiểm ở bước 5 |
| `ReportPageTableView.tsx` là file chung với UOW-02 | T-02-03 phụ thuộc T-01-01 |

## Definition of done

- [ ] AC-01..07 xanh trong `verify-t0103.py`, ảnh chụp mỗi loại phiếu + drill-down + tài khoản thiếu quyền
- [ ] `pnpm --filter @erp/backoffice-web exec tsc --noEmit` xanh
- [ ] Demo script chạy trước Akenzy và được chấp nhận tại G4
