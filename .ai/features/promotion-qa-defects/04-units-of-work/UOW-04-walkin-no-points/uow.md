---
id: UOW-04
slug: walkin-no-points
title: Hoá đơn khách vãng lai không ghi và không in điểm tích
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-04]
verifies: [AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: revert code; migration dọn dữ liệu chỉ đặt về 0 những giá trị vốn đã vô nghĩa, không cần down thật
---

# UOW-04 — Không tích điểm cho khách không có thẻ

Hoá đơn không chọn khách vẫn ghi `points_earned` và in "Điểm được tích +122" lên biên lai. Không thẻ
nào được cộng, không dòng `point_history` nào được tạo — con số in ra là số ảo. Khách vãng lai cầm
hoá đơn ghi có điểm mà không có điểm.

Kiểm chứng trên `erp_dev`: `INV-202608-00006` và `INV-202608-00007` đều có `customer_id = NULL` với
`points_earned = 54` và `382`, trong khi `point_history` chỉ có 4 dòng khớp đúng 4 hoá đơn **có**
khách.

Lỗi nằm ở BE và có ở **cả hai** luồng checkout (ADR-05). FE chỉ phản chiếu trung thực một giá trị
sai — sửa BE là dòng trên biên lai tự biến mất, không cần đổi gì ở POS. Nếu chỉ chặn ở FE thì cột
`invoices.points_earned` vẫn bẩn và báo cáo vẫn đọc phải.

## Demo script

1. Bán một hoá đơn **không chọn khách hàng** với cờ `VITE_CHECKOUT_V2 = true`.
2. `invoices.points_earned = 0`, không có dòng `point_history` nào (AC-11).
3. In biên lai → **không** có dòng "Điểm được tích" (AC-12).
4. Lặp lại bước 1–3 với `VITE_CHECKOUT_V2 = false` → kết quả giống hệt (AC-13).
5. Ca đối chứng: bán có chọn khách → vẫn tích điểm bình thường, `point_history` có dòng EARN.
6. Sau migration: `select count(*) from invoices where customer_id is null and points_earned <> 0` → **0**.

## In scope

- Chặn `pointsEarned` theo `customerId` ở cả `checkout-invoice.service.ts` (v1) và
  `persist-invoice.step.ts` (v2).
- Migration đặt `points_earned = 0` cho hoá đơn không có khách.

## Not in scope

- Sửa FE — dòng biên lai tự mất khi BE trả 0. Không đụng `renderInvoiceHtml.ts` hay các payload builder.
- Đổi công thức tích điểm hay tỷ giá.
- Cột `points_balance_after` — đã chặn đúng theo `customerId` sẵn.

## Definition of done

- [ ] AC-11…AC-13 pass
- [ ] `select count(*) from invoices where customer_id is null and points_earned <> 0` trả 0
- [ ] Bán có khách không hồi quy ở cả hai luồng
- [ ] Không sửa file nào trong `apps/pos-web` cho lỗi này
- [ ] Demoed và accepted at gate G4
