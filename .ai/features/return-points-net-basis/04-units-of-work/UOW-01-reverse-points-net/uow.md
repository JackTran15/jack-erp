---
id: UOW-01
slug: reverse-points-net
title: Trả hàng chỉ trừ đúng số điểm món đó đã tích
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-10]
risk: medium
status: todo
rollback: hoàn nguyên `computeReverseBase` về `amountDue × returnSubtotal / subtotal` — một hàm, không schema, không hợp đồng API, không dữ liệu phải dọn
---

# UOW-01 — Trả hàng chỉ trừ đúng số điểm món đó đã tích

Lát cắt chữa đúng lỗi được báo. Khách trả một món đang khuyến mại thì bị trừ nhiều điểm hơn
số điểm món đó từng mang lại, và phần hụt nằm lại trên **số hàng họ vẫn đang giữ**.

Rủi ro thật của lát cắt này không nằm ở phép tính — nó nằm ở chỗ **lỗi không tự biểu hiện**.
Khuyến mại đều tay cho tỷ lệ gộp bằng tỷ lệ ròng; trả toàn bộ cho tỷ lệ bằng 1. Cả hai đều
xanh trước và sau khi sửa. Ai lấy hoá đơn khuyến mại có sẵn trên dev để kiểm sẽ kết luận
"không có lỗi" (A-R1). Vì vậy ticket đầu tiên của UoW này là dựng cho được hoá đơn tái hiện,
trước khi đụng vào một dòng code sản phẩm nào.

## Demo script

1. Dựng hoá đơn R1 trên dev: hai dòng, dòng A gộp 490.000 có khuyến mại 26.000 (ròng
   464.000), dòng B gộp 9.510.000 không khuyến mại. Chốt đơn cho khách có thẻ.
2. Mở DB: `invoices.points_earned = 997`, `amount_due = 9.974.000`.
3. POS → Đổi trả hàng → chọn hoá đơn R1 → **chỉ trả dòng A** → chốt phiếu trả.
4. Tiền hoàn hiện **464.000** (đã đúng từ trước, xác nhận không hồi quy).
5. Mở DB phiếu trả: `points_reversed = 46`. Trước khi sửa chỗ này là **48**.
6. Xem thẻ khách: điểm còn lại từ hoá đơn R1 là **951** — đúng bằng điểm mà riêng dòng B
   khách vẫn đang giữ tự nó mang lại. Trước khi sửa là 949.
7. Đối chiếu `invoices.points_reversed` với payload sự kiện đảo điểm trong Redpanda Console:
   hai số bằng nhau.
8. Lấy một hoá đơn cũ không khuyến mại, trả một phần → số điểm trừ **không đổi** so với
   trước khi sửa.

## In scope

- `computeReverseBase` (`checkout-return.service.ts:632`) chuyển sang cơ sở ròng theo ADR-01.
- Giữ nguyên nhánh thoái lui cho trả nhanh không có hoá đơn gốc (ADR-02).
- Viết lại docblock `:507-513` — nhận định "`returnSubtotal` stays GROSS on purpose" nay đã sai.
- Thêm `pointsReversed` vào dòng log tổng kết `:497`.
- Hoá đơn tái hiện dùng chung cho cả UOW-02.

## Not in scope

- `computeRedeemedCreditBack` — điểm **hoàn lại**, thuộc UOW-02. Hai hàm cạnh nhau nhưng
  demo tách được, và lỗi được báo chỉ nằm ở hàm này.
- Sửa điểm của các phiếu trả đã post (A-02).
- Đổi `returnSubtotal` hay bất kỳ đại lượng tiền nào — đường tiền đã đúng.

## Risks

| Risk | Mitigation |
|---|---|
| Kiểm bằng hoá đơn khuyến mại có sẵn trên dev → xanh giả, kết luận "không có lỗi" (A-R1) | T-01-01 dựng hoá đơn khuyến mại **không đều tay** trước, và test phải **đỏ** trước khi T-01-02 chạy |
| Rút gọn hàm xuống một dòng, xoá mất nhánh trả nhanh (A-R2) | ADR-02 ghi rõ; T-01-02 có case QUICK riêng (AC-05) |
| Sửa kỳ vọng của test cũ cho xanh thay vì đọc hiểu (A-08) | T-01-04 rà từng case đang khoá cơ sở gộp, mỗi thay đổi kỳ vọng phải kèm lý do trong diff |
| Đẳng thức `Σ netLine − headerResidual = amountDue` gãy ở một biên nào đó (A-06) | AC-03 (trả toàn bộ đảo đúng `points_earned`) là chốt chặn máy kiểm được |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-10 pass ở mức unit (55/55 trong spec)
- [x] Hoá đơn khuyến mại **không đều tay** có trong fixture test, và test AC-01 đã được chứng
      minh là đỏ trước khi sửa
- [x] Không hoá đơn v1 nào (mọi `promotion_discount = 0`) đổi số điểm
- [x] Luồng trả nhanh không có hoá đơn gốc không sinh `NaN`, không chia cho 0
- [x] Docblock `:507-513` đã viết lại, bằng tiếng Anh, nêu cơ sở mới và vì sao đổi
- [x] `pnpm --filter @erp/api test` xanh, không case nào bị sửa kỳ vọng mà thiếu lý do
- [ ] Demoed và accepted at gate G4 — **CHƯA**: cần chạy Demo script trên app thật
