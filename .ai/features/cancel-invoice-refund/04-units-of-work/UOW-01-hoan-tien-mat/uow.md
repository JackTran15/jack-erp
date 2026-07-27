---
id: UOW-01
slug: hoan-tien-mat
title: Hủy hóa đơn tiền mặt sinh phiếu chi và trừ đúng quỹ
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: high
status: todo
rollback: Gỡ consumer khỏi cash-vouchers.module.ts — payload thừa trường `refunds` là vô hại, luồng hủy quay về hành vi cũ
---

# UOW-01 — Hủy hóa đơn tiền mặt sinh phiếu chi và trừ đúng quỹ

Lát cắt xương sống của epic: payload sự kiện học được cách mang phần hoàn, và chân
tiền mặt — chân đang hỏng nặng nhất — chạy hết đường từ hủy đến phiếu chi.

## Demo script

1. Vào POS, bán một hóa đơn 1.000.000₫ trả tiền mặt. Ghi lại số dư quỹ tiền mặt chi nhánh
   ở Backoffice → Sổ quỹ tiền mặt.
2. Gọi `POST /invoices/:id/cancel` với `{ "reason": "Khách đổi ý" }` (Postman — nút bấm là UOW-06).
3. Mở Backoffice → Phiếu chi: có một phiếu mới, số tiền 1.000.000₫, nội dung
   "Hoàn tiền hủy hóa đơn <mã HĐ>", trạng thái POSTED.
4. Mở lại Sổ quỹ tiền mặt: số dư giảm đúng 1.000.000₫ so với bước 1.
5. Mở lưới Phiếu thu: phiếu thu POS_SALE gốc vẫn còn, vẫn POSTED — không bị đảo.
6. Lặp với hóa đơn 1.000.000₫ thu trước 600.000₫ (partial_debt): phiếu chi ghi 600.000₫.
7. Lặp với hóa đơn công nợ chưa thu đồng nào: không có phiếu chi nào sinh ra.

## In scope

- Mở rộng `InvoiceCancelledPayload` bằng `refunds[]`, tính trong `CancelInvoiceService`
- Consumer mới sinh phiếu chi tiền mặt qua `CashPaymentsService.createAndPostInternal`
- E2E trên DB thật kiểm số dư quỹ

## Not in scope

- Chân tiền gửi (UOW-02)
- Dòng liên kết `voucher_links` (UOW-03) — phiếu chi lúc này mới chỉ ref tới hóa đơn
- Guard chặn hủy sai loại hóa đơn (UOW-05)

## Risks

| Risk | Mitigation |
|---|---|
| Trừ quỹ hai lần nếu sự kiện được gửi lại | `createAndPostInternal` chống trùng sẵn theo `(referenceType, referenceId)`; T-01-03 có case replay chạy consumer hai lần |
| Ràng buộc ngầm với double-post GL ở chân bán (ADR-05) | T-01-03 kiểm cả số dư GL lẫn số dư quỹ, nên ai phá cân bằng sẽ thấy test đỏ |
| Quỹ không đủ số dư → phiếu chi ném lỗi, hóa đơn đã hủy rồi | Cố ý: lỗi rơi vào DLQ để replay; ghi rõ trong Error taxonomy |

## Definition of done

- [ ] AC-01, AC-02, AC-03, AC-04 pass
- [ ] Demo script chạy được từ đầu đến cuối trên môi trường dev
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Không có tiếng Việt nào trong source backend ngoài chuỗi `description` của chứng từ
- [ ] Demoed và accepted ở gate G4
