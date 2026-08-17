---
id: UOW-02
slug: journal-two-legs
title: Bút toán trả hàng ghi đúng hai chân khi phiếu bị tách
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-11]
risk: medium
status: todo
rollback: revert consumer + publisher; sự kiện không mang `offsetAmount` rơi về nhánh cũ theo `refundMethod`
---

# UOW-02 — Bút toán hai chân

`journal-return.consumer` chỉ sở hữu những chân **không** có chứng từ quỹ tương ứng. Nó
đang nhận biết bằng `refundMethod === OFFSET` và post **toàn bộ** `refundedAmount`. Sau
UOW-01 điều đó vừa sai số tiền vừa sai điều kiện: một phiếu tách có cả chân phải thu (do
consumer này sở hữu) lẫn chân tiền (do chứng từ quỹ sở hữu).

## Demo script

1. Chạy lại demo của UOW-01 (phiếu trả 765.000, cấn trừ 465.000, chi 300.000)
2. Redpanda Console — xem sự kiện `JOURNAL_POST_RETURN` mang `offsetAmount: 465000`
3. `psql` — bút toán nguồn `RETURN` cho phiếu trả: **DR doanh thu 465.000 / CR phải thu 465.000**
4. `psql` — bút toán nguồn `CASH_MOVEMENT` của phiếu chi: DR doanh thu 300.000 / CR tiền mặt 300.000
5. Cộng dồn: doanh thu bị ghi nợ đúng 765.000 một lần duy nhất, không trùng chân nào
6. Lặp với phiếu cấn trừ toàn phần → chỉ có bút toán `RETURN`, không có bút toán quỹ

## In scope

- Trường `offsetAmount` trên payload `JOURNAL_POST_RETURN`
- Consumer phân nhánh theo `offsetAmount > 0` với số tiền `offsetAmount`

## Not in scope

- Chân tiền mặt / tiền gửi (đã thuộc chứng từ quỹ, UOW-01 đã chỉnh số tiền)
- Bút toán của đường huỷ phiếu (UOW-03)

## Risks

| Risk | Mitigation |
|---|---|
| Sự kiện cũ còn trong topic không có `offsetAmount` | Mặc định 0 và giữ nguyên nhánh `refundMethod` cho STORE_CREDIT — test riêng cho payload cũ |
| Double-post GL nếu vô tình post cả chân tiền | Test khẳng định consumer **không** sinh dòng nào cho phần `cashOut` |

## Definition of done

- [x] AC-11 pass
- [x] Mọi bút toán sinh từ một phiếu trả có tổng nợ = tổng có
- [x] Payload cũ (không có `offsetAmount`) vẫn xử lý được, có test chứng minh
- [ ] Demoed và accepted at gate G4
