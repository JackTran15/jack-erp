---
id: UOW-02
slug: open-invoice-from-report
title: Bấm Số hóa đơn / Tham chiếu trên báo cáo Quỹ tiền mở "Chi tiết hóa đơn", kể cả phiếu hoàn tiền
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-08, AC-09, AC-10, AC-11]
risk: low
status: todo
rollback: Revert các commit của UoW; backend chỉ thêm một khoá ẩn và một loại tham chiếu, không migration.
---

# UOW-02 — Mở hóa đơn từ Số hóa đơn / Tham chiếu

## Demo script

Cùng môi trường UOW-01.

1. Bảng kê thu chi, kỳ Năm nay, Sửa mẫu → bật "Số hóa đơn". Dòng phiếu thu POS có Số hóa đơn
   và Tham chiếu "INVOICE <mã>" tô xanh; dòng phiếu chi hoàn tiền có Số hóa đơn và Tham chiếu
   "REFUND <mã>" (trước đây trống / "REFUND") (AC-08).
2. Bấm Số hóa đơn → "Chi tiết hóa đơn" đúng hóa đơn (AC-09); bấm Tham chiếu → cùng hóa đơn;
   Tham chiếu "MANUAL" / "FUND_SWAP" / "GOODS_RECEIPT" không bấm được (AC-10).
3. Bảng kê tiền chi theo mục chi, bật Số hóa đơn → dòng hoàn tiền bấm được (AC-09).
4. Tổng Tiền thu / Tiền chi và số dư cuối của bảng không đổi so với trước khi deploy (AC-08).
5. Tài khoản không có `reporting.invoice.branch.read` → hai cột là text (AC-11).

## In scope

- Backend: `REFUND` vào `INVOICE_REFERENCE_TYPES`, `_invoiceId` trên dòng của #3 và #5; unit + e2e.
- FE: resolver `invoiceNumber` (#3, #5) và `reference` (#3) có gating quyền.

## Not in scope

- Tham chiếu phiếu nhập / chuyển quỹ / điều chuyển (A-01).

## Risks

| Risk | Mitigation |
| --- | --- |
| Lọc cột "Số hóa đơn" / "Tham chiếu" nay bắt thêm dòng REFUND — người dùng đã lưu mẫu lọc thấy khác | Chấp nhận (A-04); nêu trong ghi chú PR |
| Fixture e2e chưa có hóa đơn | T-02-02 tạo hóa đơn tối thiểu trong file e2e của mình, không sửa fixture dùng chung |

## Definition of done

- [x] AC-08 xanh ở unit + e2e (`cash-fund-report-list`, `cash-fund-report-expenses`)
- [x] AC-09..11 xanh trong `verify-t0204.py`, có ảnh chụp
- [ ] Demo script chạy trước Akenzy và được chấp nhận tại G4
