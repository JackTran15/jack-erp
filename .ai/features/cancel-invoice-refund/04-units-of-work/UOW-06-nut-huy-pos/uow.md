---
id: UOW-06
slug: nut-huy-pos
title: Admin hủy hóa đơn ngay trên màn hình danh sách hóa đơn POS
demoable: true
duration: 1d
depends_on: [UOW-05]
requirements: [US-06]
verifies: [AC-17, AC-18, AC-19, AC-20]
risk: low
status: todo
rollback: Gỡ nút khỏi `InvoiceReceiptDialog` — endpoint vẫn còn, chỉ là không ai gọi, đúng như trước epic
---

# UOW-06 — Nút hủy hóa đơn trên POS

Endpoint `POST /invoices/:id/cancel` đã tồn tại từ lâu nhưng **không màn hình nào gọi**.
Lát cắt này biến toàn bộ backend phía trên thành thứ dùng được bằng chuột.

Phụ thuộc UOW-05 vì AC-20 cần thông báo lỗi thật từ guard để hiển thị.

## Demo script

1. Đăng nhập POS bằng tài khoản **admin**, mở màn Danh sách hóa đơn.
2. Click vào một hóa đơn đã thanh toán → dialog chi tiết mở, có nút "Hủy hóa đơn".
3. Bấm nút → hiện ô nhập lý do; nhập "Khách đổi ý" và xác nhận.
4. Dialog đóng, danh sách nạp lại, hóa đơn hiện trạng thái "Đã hủy".
5. Mở lại hóa đơn đó → không còn nút "Hủy hóa đơn".
6. Đăng xuất, đăng nhập bằng tài khoản **không phải admin**, mở cùng hóa đơn khác →
   không thấy nút.
7. Thử hủy một hóa đơn đã có phiếu trả hàng → dialog hiện thông báo lỗi tiếng Việt từ API,
   hóa đơn giữ nguyên.

## In scope

- Service call + hook TanStack Query cho việc hủy
- Nút và dialog nhập lý do trong `InvoiceReceiptDialog`
- Gate hiển thị theo role admin

## Not in scope

- Màn hình Backoffice (ngoài phạm vi từ G0)
- Thay đổi quyền phía backend — vẫn là `pos.invoice.write` (A-09)

## Risks

| Risk | Mitigation |
|---|---|
| Danh sách không nạp lại sau khi hủy | Invalidate theo prefix `["invoices"]` chứ không invalidate đúng một key |
| Tên role admin viết khác nhau giữa các môi trường | T-06-02 phải đọc cách repo đang xác định admin ở chỗ khác trước, không tự bịa chuỗi |

## Definition of done

- [ ] AC-17, AC-18, AC-19, AC-20 pass
- [ ] Demo script chạy được từ đầu đến cuối trên POS thật
- [ ] Toàn bộ chuỗi hiển thị bằng tiếng Việt
- [ ] `pnpm --filter @erp/pos-web build` không lỗi type
- [ ] Demoed và accepted ở gate G4
