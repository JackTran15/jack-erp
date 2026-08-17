---
id: UOW-06
slug: promotion-validation
title: CTKM thiếu dữ liệu bị chặn lúc lưu, và dữ liệu hỏng sẵn có không làm chết quầy
demoable: true
duration: 2d
depends_on: []
requirements: [US-08]
verifies: [AC-23, AC-24, AC-25, AC-26]
risk: high
status: todo
rollback: revert code — chỉ thêm luật validate và guard, không đụng dữ liệu
---

# UOW-06 — Chặn CTKM hỏng

Lỗi nghiêm trọng nhất về vận hành: CTKM "Giảm giá hoá đơn" không hàng hoá lưu được bình thường,
nhưng sau đó **mọi** lần tính tiền đều 500 INTERNAL_ERROR — cả quầy không bán được cho tới khi xoá
CTKM đó. Một dữ liệu hỏng làm sập toàn bộ điểm bán.

Cùng họ với nó là CTKM sinh nhật lưu được mà không chọn kiểu khớp: không nổ, nhưng **không bao giờ
khớp ai** — hỏng âm thầm. `validate()` có luật cho `CUSTOMER_GROUP` và `CARD_TIER` nhưng không có
cho `BIRTHDAY`.

Phòng thủ hai lớp (D6), vì đã có dữ liệu hỏng nằm sẵn trong DB: **chặn đầu vào** để không sinh thêm,
và **chịu được dữ liệu hỏng** để những gì đã lưu không làm chết quầy. Chỉ làm một lớp là chưa đủ.

> ⚠️ **A-06**: đường 500 đã tìm thấy (`groups[0]` khi `groups: []`) là đường **qua API**. Form
> backoffice luôn gửi 1 group với `lines` rỗng — **không** crash. T-06-01 phải tái hiện ca thật
> **trước** khi sửa, và nếu ra nguyên nhân khác thì mở thêm ticket, không âm thầm coi là xong.

## Demo script

1. **Tái hiện trước**: dựng lại ca QA cho tới khi thấy 500 thật, ghi lại payload chính xác (T-06-01).
2. Tạo CTKM "Giảm giá hoá đơn" không có nhóm/dòng hàng hoá → bị từ chối lúc lưu, lỗi trỏ đúng field
   thiếu (AC-23).
3. Với CTKM hỏng **đã nằm sẵn** trong DB, POS tính tiền cho mọi giỏ hàng → không 500; CTKM đó đơn
   giản không được áp dụng (AC-24).
4. Tạo CTKM "Áp dụng cho = Khách hàng có sinh nhật" mà không chọn kiểu khớp → bị từ chối, lỗi trỏ
   đúng field kiểu khớp (AC-25).
5. Tạo CTKM thiếu Nhóm khách hàng, và thiếu Hạng thẻ → vẫn báo lỗi đúng như trước (AC-26).
6. Sửa (update) một CTKM về trạng thái thiếu dữ liệu → cũng bị chặn, không chỉ lúc tạo.

## In scope

- Invariant `groups.length > 0` và luật `applyTo === BIRTHDAY ⇒ birthdayMatch` trong `validate()`.
- `@ArrayNotEmpty()` cho `groups` ở DTO (update kế thừa nên tự có).
- Guard `groups[0]` ở cả 5 strategy — kể cả `BUY_M_GET_N + CHEAPEST` dính lỗi tiềm ẩn y hệt.
- FE backoffice hiện lỗi cho `birthdayMatch`.

## Not in scope

- Bổ sung option `EXACT_DAY` ("đúng ngày") còn thiếu ở UI backoffice — là khoảng trống thật nhưng
  không phải lỗi QA báo; ghi nhận để làm riêng.
- Rà soát/dọn CTKM hỏng đã tồn tại — lớp guard đã đủ để chúng vô hại.
- Thêm try/catch tổng ở `evaluate-cart.handler` — chữa triệu chứng, và sẽ giấu mất lỗi thật sau này.

## Definition of done

- [ ] AC-23…AC-26 pass
- [ ] Ca 500 thật đã được tái hiện và ghi lại payload trước khi sửa (A-06)
- [ ] Với mọi CTKM hỏng có thể dựng ra, POS vẫn tính tiền được — không đường nào ra 500
- [ ] Cả tạo lẫn sửa CTKM đều bị chặn
- [ ] Hai luật validate sẵn có không hồi quy
- [ ] Demoed và accepted at gate G4
