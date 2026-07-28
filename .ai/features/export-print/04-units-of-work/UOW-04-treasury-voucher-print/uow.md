---
id: UOW-04
slug: treasury-voucher-print
title: In phiếu thu chi tiền mặt và tiền gửi (A5)
demoable: true
duration: 1.5d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-14, AC-15]
risk: low
status: todo
rollback: Ẩn nút In ở 4 dialog treasury
---

# UOW-04 — In phiếu thu chi tiền mặt và tiền gửi (A5)

## Demo script

1. Mở Quỹ → Thu chi tiền mặt, chọn một phiếu thu, mở chi tiết
2. Bấm "In" → hộp thoại in mở ra với mẫu A5
3. Kiểm tra: số phiếu, ngày thu, đối tượng nộp, lý do thu
4. Kiểm tra bảng Diễn giải / Số tiền / Mục thu và dòng tổng
5. Kiểm tra dòng "Số tiền bằng chữ" đọc đúng tiếng Việt (thử một số lẻ hàng nghìn, ví dụ 1.234.567)
6. Lặp lại với phiếu chi tiền mặt, phiếu thu tiền gửi, phiếu chi tiền gửi — đúng tiêu đề và đúng nhãn đối tượng nộp/nhận

## In scope

- Hàm đọc số thành chữ tiếng Việt
- 4 route print-payload + mapper
- Nối nút In ở 4 dialog treasury

## Not in scope

- Mẫu khổ 80mm cho máy in nhiệt
- Phiếu kiểm kê quỹ

## Risks

| Risk | Mitigation |
|---|---|
| Đọc số thành chữ tiếng Việt nhiều trường hợp biên (linh, lẻ, mươi, mười, tư, năm/lăm) | T-04-01 phủ bằng bảng test các mốc: 101, 1005, 15, 21, 24, 25, 1234567, 0 |

## Definition of done

- [ ] Cả AC-14..15 pass
- [ ] Hàm đọc số thành chữ có unit test phủ các trường hợp biên
- [ ] Dùng lại đúng `renderVoucherHtml` của UOW-03, không thêm khuôn mới
- [ ] Demo script chạy được trước người thật ở gate G4
