---
id: UOW-02
slug: report-table-print
title: In bảng báo cáo ra A4
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: Trả nút In về stub toast; `print-payload` route để lại vô hại
---

# UOW-02 — In bảng báo cáo ra A4

## Demo script

1. Mở Báo cáo → Tồn kho (`/reports/inventory`), đặt bộ lọc và ẩn vài cột
2. Chuyển sang trang 3 của bảng
3. Bấm "In" → chọn "Khổ A4 (ngang)"
4. Hộp thoại in của trình duyệt mở ra: đầu trang có tên chi nhánh, tên báo cáo, khoảng thời gian
5. Kiểm tra bản xem trước có đúng các cột đang hiển thị và toàn bộ dòng theo bộ lọc
6. Huỷ hộp thoại in → màn hình vẫn ở trang 3, bộ lọc nguyên vẹn
7. Bấm In lại, chọn "Khổ A4 (dọc)" → bản xem trước đổi sang hướng dọc

## In scope

- `printHtmlDocument` dùng chung, port từ pos-web
- Route `print-payload` cho 4 miền
- Renderer HTML bảng báo cáo + chọn hướng giấy

## Not in scope

- In chứng từ (UOW-03/04)
- Xuất PDF

## Risks

| Risk | Mitigation |
|---|---|
| Bảng rất rộng bị tràn khổ A4 | CSS `table-layout: fixed` + thu nhỏ cỡ chữ theo số cột; hướng ngang là mặc định |

## Definition of done

- [x] Cả AC-08..10 pass — xác nhận qua đối chiếu code + xác nhận một phần trên trình
      duyệt thật (`/reports/sales`: Lấy dữ liệu → bấm "In" → dropdown 2 khổ giấy mở đúng,
      không lỗi console); không tự bấm tiếp tới `window.print()` thật (dialog hệ điều
      hành, nằm trong danh sách không được tự kích hoạt)
- [x] Không thêm dependency nào vào backoffice-web — `package.json` không đổi
- [x] `printHtmlDocument` được cả UOW-03 dùng lại, không phải bản sao thứ hai — chữ ký
      thuần `(html: string) => Promise<void>`, không có gì đặc thù cho báo cáo
- [ ] Demo script chạy được trước người thật ở gate G4 — **chưa chạy đủ**: bước 1–2, 6 (đặt
      bộ lọc/ẩn cột, chuyển trang, giữ nguyên trạng thái) đã xác nhận qua code; bước 3–5, 7
      (mở hộp thoại in thật, xem bản xem trước, đổi hướng giấy) cần một người bấm thật —
      dialog in không tự kích hoạt được trong phiên automation
