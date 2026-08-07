---
id: UOW-03
slug: voucher-redeems
title: Voucher trừ tiền thật và không tiêu được hai lần
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-06]
verifies: [AC-18, AC-19, AC-20, AC-21, AC-22]
risk: medium
status: todo
rollback: bỏ forward `voucherCode` trong `invoice.service.ts` → voucher quay về chip trang trí; endpoint `lookup` để lại vô hại vì không ai gọi
---

# UOW-03 — Voucher trừ tiền thật và không tiêu được hai lần

Lát cắt có tác động thấy được rõ nhất với khách hàng: hiện tại khách đưa voucher 100.000₫,
thu ngân nhập mã, chip hiện lên panel phải, **khách vẫn trả đủ giá**. Comment tại
`use-checkout-promotion.ts:74` ghi *"BE chưa có endpoint apply-voucher"* — viết trước khi
`redeem-voucher.step.ts` tồn tại, nay đã sai.

`evaluate` mù voucher (ADR-01), nên UoW này mang theo một endpoint mới:
`GET /v2/vouchers/lookup?code=`. Không có nó thì thu ngân chỉ biết mã sai vào đúng lúc chốt đơn.

## Demo script

1. Backoffice: tạo voucher mệnh giá 100.000, hiệu lực hôm nay (khuôn `TEST VOUCHER 100K`
   đã dựng trên MISA ngày 06/08/2026)
2. POS bằng tài khoản `STAFF`: thêm hàng cho tới khi còn phải thu **1.046.500**
3. Mở `VoucherDialog`, gõ mã đúng → thấy tên chương trình và mệnh giá **100.000** ngay,
   chưa cần bấm Thu tiền
4. Đồng ý → panel phải hiện dòng "Voucher (1) 100.000", còn phải thu **946.500**
   (đối chiếu HĐ MISA `2608050002`)
5. Gõ một mã không tồn tại → thông báo "Mã voucher không tồn tại", không có gì vào draft
6. Bấm Thu tiền → DevTools cho thấy request chứa `voucherCode`
7. Mở DB: voucher có `redeemed_invoice_id` trỏ về hoá đơn vừa chốt
8. Mở hoá đơn mới, gõ lại đúng mã đó → thông báo "Voucher đã được sử dụng"

## In scope

- `GET /v2/vouchers/lookup?code=` + permission `pos.voucher.read` cấp cho `STAFF`
- `VoucherDialog` gọi lookup thật, hiển thị mệnh giá và lý do không dùng được
- Trừ mệnh giá ở panel; forward `voucherCode` lên checkout
- Xử lý va chạm: voucher bị quầy khác tiêu mất giữa chừng

## Not in scope

- Nhiều voucher trên một hoá đơn (A-12: `voucherCode` là `string`, không phải mảng)
- Phát hành / nạp số lượng voucher — thuộc backoffice, đã xong
- Voucher `Áp dụng cho: Hàng hóa | Nhóm hàng hóa` của MISA — contract hiện tại chỉ có mã
  ở mức hoá đơn; nếu cần thì mở feature riêng

## Risks

| Risk                                                                                             | Mitigation                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `lookup` là endpoint mới đọc dữ liệu khuyến mại — dễ lộ voucher tổ chức khác nếu quên lọc         | T-03-03 có case e2e riêng: đoán đúng mã của tổ chức khác vẫn phải trả `NOT_FOUND`                                 |
| FE tự trừ mệnh giá ở tầng hiển thị (ADR-01) ⇒ nguy cơ lệch số so với saga                        | T-03-05 chỉ trừ để **hiển thị**; số chốt vẫn của server, và T-06-05 đo độ lệch trên toàn tổ hợp                   |
| Hai quầy cùng dùng một mã                                                                        | `redeem-voucher.step.ts` + conditional update đã có và đã có e2e (AC-21 của checkout-saga); T-03-06 lo phần UI    |

## Definition of done

- [ ] AC-18..AC-22 pass theo Demo script
- [ ] Không voucher tổ chức khác nào tra được, kể cả khi biết chính xác mã
- [ ] Voucher đã tiêu không tiêu lại được, và UI nói rõ lý do
- [ ] `pnpm --filter @erp/api test` và `test:e2e` xanh; `tsc --noEmit` của `pos-web` sạch
- [ ] `pnpm openapi:generate` đã chạy, `openapi.snapshot.json` + `schema.ts` đã commit
- [ ] Demoed và accepted ở gate G4
