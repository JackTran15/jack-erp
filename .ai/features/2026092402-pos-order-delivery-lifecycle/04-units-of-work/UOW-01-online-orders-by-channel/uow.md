---
id: UOW-01
slug: online-orders-by-channel
title: Đơn hàng Online trên POS — sidebar kênh + lưới đơn của chi nhánh
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: medium
status: todo
rollback: gỡ route /online-orders + mục menu; endpoint search và sales-channels là thêm mới, không đổi route cũ
---

# UOW-01 — Đơn hàng Online trên POS — sidebar kênh + lưới đơn của chi nhánh

## Demo script
1. Đăng nhập POS với TN-A ở CN-A, mở menu → "Đơn hàng online"; sidebar chỉ có WEB, SHOPEE (không ZALO), WEB được chọn sẵn (AC-01)
2. Lưới WEB + "Chưa xử lý" + "Hôm nay": có SO-1, không SO-2, không SO-9; đủ 10 cột (AC-02, AC-03)
3. Gõ "*abc" ở cột Mã đơn hàng (OCM), "≤ 500000" ở Tổng thanh toán → kết quả và "x-y/z kết quả" đúng (AC-04)
4. SO-1 có stock_short → cột Nhãn "Thiếu hàng" (AC-05)

## In scope
- `GET /mobile/sales-channels`
- `POST /v2/mobile/sales-orders/search` — view ONLINE (ADR-03)
- Trang `OnlineOrderListPage`, route `/online-orders`, gắn menu `don-hang-online`

## Not in scope
- Nhận xử lý (UOW-02)
- view DELIVERY (UOW-04)

## Risks
| Risk | Mitigation |
| --- | --- |
| FilterBuilder chưa hỗ trợ cột dẫn xuất (Thông tin giao hàng ghép chuỗi) | Lọc cột ghép trên từng cột gốc (recipient_name/phone/address) bằng OR; ghi rõ trong handler |
| Múi giờ "Hôm nay" lệch UTC | from/to tính theo Asia/Ho_Chi_Minh ở server, spec có case 23:30 giờ VN |

## Definition of done
- [x] AC-01..AC-05 có bằng chứng (spec handler + ảnh POS) (07-verification.md; AC-05 ảnh 2026-09-27; AC-04 chỉ spec phần gõ lọc)
- [x] `pnpm --filter @erp/api test -- search-branch-sales-orders` xanh (07-verification.md; 2026-09-25)
- [x] `pnpm --filter @erp/pos-web build` xanh (07-verification.md; 2026-09-25)
