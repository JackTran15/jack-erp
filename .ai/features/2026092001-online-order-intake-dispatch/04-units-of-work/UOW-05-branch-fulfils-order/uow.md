---
id: UOW-05
slug: branch-fulfils-order
title: Chi nhánh xử lý đơn được phân thành hoá đơn, trừ tồn và mở công nợ COD
demoable: true
duration: 2d
depends_on: [UOW-02, UOW-04]
requirements: [US-04, US-08]
verifies: [AC-16, AC-17, AC-18, AC-19, AC-20, AC-28, AC-29]
risk: high
status: todo
rollback: revert FE về nguồn mock + revert phần chép phí/kênh sang hoá đơn; hoá đơn đã phát hành KHÔNG revert được — huỷ bằng luồng huỷ hoá đơn có sẵn
---

# UOW-05 — Chi nhánh xử lý đơn

## Demo script
1. Đơn web có phí GH 30.000, tiền hàng 1.000.000, đã được Admin phân cho Hồ Chí Minh (UOW-02)
2. Đăng nhập POS Hồ Chí Minh **chưa mở ca** → bấm xử lý đơn → lỗi *"Chi nhánh chưa mở ca"*; đơn vẫn `SENT`, không có hoá đơn nháp
3. Mở ca → xử lý đơn → hoá đơn nháp sinh ra, hoàn tất thu ngân
4. Adminer: tồn `SKU-500` tại Hồ Chí Minh giảm đúng số lượng; `invoices.amount_due` = **1.030.000**; `invoices.shipping_fee_amount` = 30.000; `invoices.sales_channel` = "Website công ty"; `invoices.sales_order_id` trỏ đúng đơn
5. `invoice_debts`: 1 dòng OPEN đúng **1.030.000** (số shipper phải thu), trỏ đúng khách khớp theo SĐT
6. `sales_orders.status` = `PROCESSED`, `invoice_id` trỏ đúng hoá đơn
7. `/orders` của Hồ Chí Minh: thấy đơn, cột "Thu hộ" = 1.030.000; đăng nhập chi nhánh kiểm thử → không thấy đơn nào
8. Mở "Thiết lập cột hiển thị" → **không còn** ĐT giao hàng, Trạng thái ĐVVC, Mã vận đơn, Phí GH trả ĐT, Thông tin gói hàng, Phiếu đối soát, Trạng thái đối soát, Mã đơn hàng trên sàn; **vẫn còn** Thu hộ, Phí GH thu khách
9. Ghi nhận khoản thu tất toán công nợ → `invoice_debts.status` = PAID, `remaining_amount` = 0
10. Đăng ký thêm kênh `ZALO`, đặt một đơn qua đó, xử lý → báo cáo doanh thu tách được WEB / ZALO / bán tại quầy, **không migration nào chạy**

## In scope
- `approve()` chép `sales_channel` + `shipping_fee` từ đơn sang hoá đơn
- Công nợ COD = `amount_due` đã gồm phí
- `/orders` đổi từ mock sang API thật
- Ẩn 8 cột vận chuyển; cột Thu hộ = `amount_due`
- Truy nguồn kênh end-to-end (AC-28)

## Not in scope
- Trả đơn về pool (UOW-06), huỷ đơn (UOW-07)
- Tài khoản hạch toán phí (A-21) — vẫn treo
- Vòng đời giao hàng: không có

## Risks
| Risk | Mitigation |
| --- | --- |
| `approve()` là đường đang chạy cho đơn mobile — sửa nó làm vỡ luồng tư vấn viên | Phần chép phí/kênh chỉ chạy khi đơn có `sales_channel_id`; e2e `sales-order` cũ là hàng rào |
| Công nợ mở đúng `amount_due` nhưng `amount_due` chưa gồm phí vì UOW-04 chưa xong | `depends_on: [UOW-04]` là ràng buộc cứng, không phải gợi ý thứ tự |
| Thay mock bằng API thật làm vỡ bộ lọc/cột đang chạy trên `OrderRow` | Giữ nguyên `OrderRow` làm hợp đồng; mapper API → `OrderRow` là một hàm, test riêng |
| Ẩn cột bằng cách xoá khỏi `ORDER_COLUMNS` ⇒ mất định nghĩa khi làm vận chuyển | A-20: ẩn khỏi *dialog*, giữ trong `ORDER_COLUMNS` |

## Definition of done
- [x] AC-16..AC-20, AC-28, AC-29 có bằng chứng trong `07-verification.md`
- [x] Luồng đơn mobile (tư vấn viên gửi → thu ngân duyệt) chạy y như trước
- [x] Hoá đơn bán tại quầy (không từ đơn) có `sales_channel` NULL và `shipping_fee_amount` 0
- [x] `pnpm --filter @erp/api test` + e2e xanh
