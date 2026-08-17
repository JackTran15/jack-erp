---
id: UOW-05
slug: promotion-reasons-time
title: CTKM không áp nói rõ lý do, và giờ áp dụng hiểu đúng khi chỉ nhập một đầu
demoable: true
duration: 2d
depends_on: []
requirements: [US-06, US-07]
verifies: [AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22]
risk: medium
status: todo
rollback: revert code — cả hai thay đổi đều thuần logic, không đụng schema hay dữ liệu
---

# UOW-05 — Lý do loại CTKM và cửa sổ giờ

Hai lỗi khác nhau nhưng cùng một họ: **quyết định nằm sai tầng**, và cùng chạm vào đường
`evaluate` nên gộp một lát để chỉ phải hồi quy engine một lần.

**Lý do bị nuốt (#6).** CTKM ngừng theo dõi hoặc ngoài khoảng ngày biến mất hoàn toàn khỏi dialog —
không một dòng, không lý do. Thu ngân không trả lời được khách "sao chương trình này không chạy".
Nguyên nhân: `typeorm-promotion.repository.ts` lọc `status` / ngày / branch ngay trong SQL, nên
nhánh `STOPPED` / `DATE_WINDOW` / `BRANCH_SCOPE` trong `eligibility.ts` và nhãn tiếng Việt tương ứng
là **code chết**. Bốn lý do còn lại chạy trên RAM — đó đúng là bốn lý do QA thấy hiển thị đúng.
`BRANCH_SCOPE` cũng dính, QA chưa gặp nhưng sửa kèm.

**Giờ áp dụng (#7).** Chỉ nhập Giờ bắt đầu thì CTKM chạy 24/24: `TimeWindow.contains` short-circuit
`return true` khi thiếu **một trong hai** đầu. Anh em `DateWindow` xử lý độc lập từng đầu — đó là mẫu
cần theo. Nhánh qua đêm 22:00–02:00 đang đúng, phải giữ nguyên.

## Demo script

1. Đặt một CTKM sang **Ngừng theo dõi**, mở dialog "Chương trình khuyến mãi" → CTKM vẫn hiện, kèm
   lý do "Đã ngừng theo dõi" (AC-15).
2. Đặt một CTKM có khoảng ngày không chứa hôm nay → vẫn hiện, lý do "Ngoài thời gian áp dụng" (AC-16).
3. Đặt một CTKM không áp dụng cho chi nhánh đang bán → vẫn hiện, kèm lý do phạm vi chi nhánh (AC-17).
4. Bốn lý do đang chạy đúng (sai thứ, sai giờ, không đủ điều kiện, không được chọn) hiển thị y như
   trước (AC-18).
5. CTKM đặt Giờ bắt đầu 18:00, bỏ trống Giờ kết thúc → bán lúc 09:00 **không** giảm; bán lúc 19:00
   **có** giảm (AC-19).
6. CTKM bỏ trống Giờ bắt đầu, Giờ kết thúc 12:00 → bán 09:00 có giảm, bán 14:00 không (AC-20).
7. CTKM 22:00–02:00 → bán 23:00 và 01:00 đều có giảm, bán 12:00 không (AC-21).
8. CTKM không nhập giờ nào → áp dụng mọi lúc (AC-22).

## In scope

- Bỏ lọc `status` / khoảng ngày / branch khỏi SQL `findActive`, giữ biên rộng (D4, A-05).
- `TimeWindow.contains` nửa khoảng (D5) và sửa `time-window.spec.ts` đang khoá hành vi cũ (A-07).

## Not in scope

- Thêm validate "both-or-neither" cho giờ (**A-08**) — mâu thuẫn với chính bản sửa D5.
- Thêm lý do mới ngoài ba lý do đang bị nuốt.
- Đổi cách hiển thị dialog ở POS — nhãn tiếng Việt đã có sẵn, chỉ là chưa bao giờ nhận được dữ liệu.
- Chuyển `EXACT_DAY` lên UI backoffice (thiếu option, nhưng thuộc UOW-06/ngoài phạm vi).

## Definition of done

- [ ] AC-15…AC-22 pass
- [ ] Ba lý do `STOPPED` / `DATE_WINDOW` / `BRANCH_SCOPE` đều tới được UI kèm nhãn tiếng Việt đúng
- [ ] Bốn lý do sẵn có không hồi quy
- [ ] Ca qua đêm 22:00–02:00 vẫn đúng
- [ ] `time-window.spec.ts` được sửa kèm lý do dẫn chiếu A-07, không phải sửa cho qua
- [ ] Thời gian phản hồi `POST /v2/promotions/evaluate` không xấu đi đáng kể sau khi bỏ lọc SQL
- [ ] Demoed và accepted at gate G4
