---
id: UOW-05
slug: chan-huy-sai-loai
title: Từ chối hủy hóa đơn trả/đổi và hóa đơn đã phát sinh trả hàng
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-05]
verifies: [AC-14, AC-15, AC-16]
risk: medium
status: todo
rollback: Gỡ hai guard khỏi `CancelInvoiceService` — quay về điều kiện chỉ xét status
---

# UOW-05 — Chặn hủy những hóa đơn không được phép

Phụ thuộc UOW-01 vì cùng sửa `cancel-invoice.service.ts`; chạy song song sẽ có bên mất bài.
Không có phụ thuộc dữ liệu nào khác.

## Demo script

1. Trên POS, tạo một hóa đơn trả hàng (Đổi trả hàng) từ một hóa đơn bán.
2. Gọi `POST /invoices/:id/cancel` cho **hóa đơn trả hàng** đó → 400, thông báo chỉ hóa đơn
   bán mới được hủy.
3. Gọi `POST /invoices/:id/cancel` cho **hóa đơn bán gốc** (đã có phiếu trả trỏ tới) → 400,
   thông báo hóa đơn đã phát sinh trả/đổi hàng.
4. Kiểm tra: không có phiếu chi nào sinh ra, tồn kho không đổi, hóa đơn giữ nguyên trạng thái.
5. Gọi cho một hóa đơn bán sạch → vẫn hủy được bình thường.

## In scope

- Guard `type = SALE`
- Guard "chưa có hóa đơn RETURN/EXCHANGE nào trỏ tới qua `original_invoice_id`"
- E2E cho cả hai đường bị chặn

## Not in scope

- Cho phép hủy một phần hoặc trừ đi phần đã hoàn — hóa đơn đã trả hàng thì dùng luồng đổi–trả

## Risks

| Risk | Mitigation |
|---|---|
| Tranh file với T-01-01 | Đã khai `depends_on: [T-01-01]` ở mức ticket, không chỉ ở mức UoW |
| Chặn nhầm hóa đơn bán hợp lệ có bản ghi đổi–trả nháp | Truy vấn phải loại hóa đơn `is_draft` và hóa đơn đã CANCELLED |

## Definition of done

- [ ] AC-14, AC-15, AC-16 pass
- [ ] Demo script chạy được từ đầu đến cuối
- [ ] Thông báo lỗi tiếng Anh ở backend, đủ rõ để frontend hiển thị nguyên văn
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4
