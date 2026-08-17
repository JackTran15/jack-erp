---
id: UOW-05
slug: gift-selection
title: Thu ngân chọn quà tặng thay vì server lấy ứng viên đầu
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-05]
verifies: [AC-14, AC-15, AC-16, AC-17]
risk: medium
status: todo
rollback: bỏ forward `selectedGifts` ở FE → saga quay về hành vi cũ (lấy ứng viên đầu); trường optional trên DTO để lại vô hại
---

# UOW-05 — Thu ngân chọn quà tặng thay vì server lấy ứng viên đầu

Engine trả `gifts[]` kèm `mode: ONE_OF` — tức "khách chọn 1 trong danh sách" — nhưng
`CheckoutV2Dto` **không có chỗ nào gửi lựa chọn đó**, nên saga tự lấy ứng viên đầu (A-11 của
`checkout-saga`). Khách muốn màu khác thì chịu.

Trên MISA ngày 06/08/2026, cả `Tặng hàng hóa` lẫn `Mua m tặng n` đều bật một dialog radio
liệt kê ứng viên kèm cột "SL thiết lập" trước khi cho xác nhận. UoW này làm đúng như vậy,
kèm trường contract còn thiếu.

## Demo script

1. Backoffice: tạo CTKM `Tặng hàng hóa` chế độ "Tặng một trong danh sách" với **3** ứng viên
2. POS: thêm hàng cho tới khi đủ điều kiện CTKM đó
3. Mở dialog Chương trình khuyến mãi, tick CTKM tặng quà, bấm Đồng ý
4. Dialog chọn quà bật lên, liệt kê đúng **3** ứng viên kèm số lượng thiết lập
5. Chọn ứng viên **thứ hai** (cố ý không phải ứng viên đầu) → Đồng ý
6. Giỏ hàng có thêm dòng quà đúng món vừa chọn, thành tiền **0**
7. Bấm Thu tiền, mở hoá đơn đã chốt: dòng quà là món **thứ hai**, không phải món đầu —
   đây là điểm mấu chốt, chọn món đầu sẽ không phân biệt được với hành vi cũ
8. Làm lại từ bước 3 nhưng đóng dialog chọn quà rồi bấm Thu tiền: bị chặn kèm thông báo,
   Network không có request nào

## In scope

- `GiftChoice` trong `@erp/shared-interfaces`; `selectedGifts?` thêm vào **cả**
  `EvaluateCartDto` và `CheckoutV2Dto` (ADR-02)
- Engine/saga tôn trọng lựa chọn và **validate** itemId thuộc danh sách ứng viên
- Dialog chọn quà ở POS; chặn checkout khi CTKM `ONE_OF` chưa chọn quà

## Not in scope

- Chế độ `ALL` (tặng tất cả trong danh sách) — không cần chọn nên không cần dialog
- Đổi số lượng quà; số lượng do CTKM quy định
- Trừ kho quà và ghi giá vốn — saga đã lo, không đụng

## Risks

| Risk                                                                                                       | Mitigation                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Thêm trường vào 2 DTO mà quên một cái ⇒ số xem trước khác số chốt đơn                                        | ADR-02 buộc thêm đồng thời; T-05-01 làm cả hai trong **một** ticket để không thể quên một nửa                          |
| Client gửi itemId không thuộc danh sách ứng viên ⇒ tặng bừa hàng ra khỏi kho                                 | T-05-02 validate ở server, trả 400; **không** tin dữ liệu client (A-07)                                                |
| Demo bằng ứng viên đầu danh sách sẽ xanh ngay cả khi tính năng chưa chạy                                     | Demo script bước 5 bắt buộc chọn ứng viên **thứ hai**; T-05-05 cũng vậy                                                |

## Definition of done

- [ ] AC-14..AC-17 pass theo Demo script
- [ ] Chọn ứng viên thứ hai ra kết quả khác với không chọn gì — chứng minh tính năng thật sự chạy
- [ ] Server từ chối itemId ngoài danh sách ứng viên
- [ ] `pnpm --filter @erp/api test` và `test:e2e` xanh; `tsc --noEmit` của `pos-web` sạch
- [ ] `pnpm openapi:generate` đã chạy, snapshot + `schema.ts` đã commit
- [ ] Demoed và accepted ở gate G4
