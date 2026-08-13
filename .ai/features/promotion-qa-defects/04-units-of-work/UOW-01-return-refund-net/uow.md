---
id: UOW-01
slug: return-refund-net
title: Trả hàng hoàn đúng số khách thực trả, không hoàn giá gộp
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: high
status: todo
rollback: cột `promotion_discount` là cột cộng thêm có DEFAULT 0 — revert code là đủ, không cần drop cột; hoá đơn đã ghi vẫn đọc được bằng code cũ
---

# UOW-01 — Hoàn tiền trả hàng theo giá ròng

Lát nặng nhất của feature: đây là chỗ tiền thật chảy ra khỏi quỹ sai số. `computeTotals` cộng
thẳng `line_total` (giá gộp) rồi đẩy con số đó vào `cash_movements` WITHDRAWAL, Phiếu chi,
STORE_CREDIT, trừ công nợ và bút toán GL — cả năm đường đều sai cùng một lượng.

Nguyên nhân không nằm ở phép trừ mà ở **dữ liệu chưa bao giờ được ghi xuống**: engine KM đã tính
phân bổ chiết khấu theo từng dòng và lưu trong `invoice_checkout_promotions.line_discounts`, nhưng
không ai ghi ngược về `invoice_items`. Lát này ghi nó xuống (D1) rồi dùng nó để tính hoàn tiền (D2).

Điểm mấu chốt về thiết kế: **không đụng `line_total`**. Báo cáo Hàng bán / Hàng trả đang đúng và
bất biến `subtotal = Σ line_total` đang được nhiều báo cáo dựa vào. `promotion_discount` là cột
đứng cạnh, không tham gia công thức cũ (ADR-01).

Không cần đổi gì ở POS: dòng trả hàng đã có sẵn FK `original_invoice_item_id`, nên server tự truy
ngược về dòng gốc để lấy phần khuyến mại. Toàn bộ lát này nằm trong backend.

## Demo script

1. Bán một hoá đơn 2 dòng, có CTKM giảm giá. Kiểm `invoice_items.promotion_discount` của từng dòng
   khớp `line_discounts` trong `invoice_checkout_promotions` (T-01-01, T-01-02).
2. Trả **một** dòng giá 500.000 được giảm 100.000 → Phiếu chi và `cash_movements` WITHDRAWAL đều
   bằng **400.000** (AC-01).
3. Trả **toàn bộ** hoá đơn subtotal 1.430.000 / KM 201.000 → hoàn **1.229.000**, không phải
   1.430.000 (AC-02).
4. Bán hoá đơn 580.000 thanh toán hoàn toàn bằng 1000 điểm (khách trả 0đ), rồi trả toàn bộ → tiền
   mặt chi ra bằng đúng `amountDue` của hoá đơn gốc, **không phải 580.000**; đồng thời điểm đã dùng
   được hoàn lại vào thẻ (AC-03).
5. Bán chịu trả một phần rồi trả hàng → tiền mặt chi ra không vượt phần tương ứng của `totalPaid`,
   phần chênh rơi vào trừ công nợ (AC-04).
6. Trả hàng của một hoá đơn **cũ** (chưa có dữ liệu phân bổ) và một phiếu **trả nhanh** không có
   hoá đơn gốc → không lỗi, không hoàn 0đ, thoái về tỷ lệ trên `amountDue` (AC-05).
7. Đối chiếu Sổ quỹ tiền mặt: tổng chi của ngày khớp đúng tổng các Phiếu chi vừa sinh.

## In scope

- Cột `invoice_items.promotion_discount` + backfill từ jsonb (D1, A-01).
- Saga ghi cột đó lúc checkout.
- Công thức hoàn tiền D2 trong `checkout-return.service.ts`, gồm mệnh đề chặn `share × totalPaid`
  (A-02) và các đường thoái lui.

## Not in scope

- Sửa lại số tiền đã hoàn sai của các hoá đơn cũ (A-04) — dữ liệu đã post là bất biến.
- Báo cáo doanh thu theo mặt hàng, dù cột mới mở đường cho nó — không nằm trong lỗi QA nào.
- Đổi `line_total` hay `subtotal` (ràng buộc cứng, xem ADR-01).
- Luồng đổi hàng phần **mua thêm** (dòng OUT) — giá hiện hành, không có phân bổ cũ để áp.

## Definition of done

- [ ] AC-01…AC-05 pass
- [ ] `Σ promotion_discount` mỗi hoá đơn khớp `Σ discount_amount` của `invoice_checkout_promotions`
- [ ] `sum(line_total) = subtotal` vẫn đúng sau backfill — không cột nào của báo cáo cũ đổi giá trị
- [ ] Trả toàn bộ một hoá đơn cho ra đúng `amountDue`, kiểm bằng số trên ít nhất 3 hoá đơn thật
- [ ] Không có đường nào chi vượt `totalPaid`
- [ ] Demoed và accepted at gate G4
