---
id: UOW-03
slug: lien-ket-chung-tu
title: Phiếu thu và phiếu chi tra ngược được ra nhau
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: Bỏ trường `linkedVoucher` khỏi response; bảng `voucher_links` để lại rỗng, không ai đọc
---

# UOW-03 — Liên kết hai chiều giữa phiếu thu và phiếu chi

Yêu cầu gốc: "2 phiếu thu và phiếu chi phải có ref lại với nhau, nó link cả invoice hủy".
Lát cắt này dựng bảng `voucher_links` và trả liên kết ra API.

Chỉ áp dụng cho cặp tiền mặt: checkout chưa từng sinh phiếu thu tiền gửi nên chân tiền gửi
không có gì để nối (A-14).

## Demo script

1. Bán một hóa đơn tiền mặt rồi hủy (đường của UOW-01).
2. Mở Backoffice → Phiếu chi, vào phiếu chi hoàn tiền vừa sinh: thấy phiếu thu POS_SALE gốc
   được tham chiếu (số chứng từ hiện ra).
3. Mở phiếu thu POS_SALE gốc: thấy phiếu chi hoàn tiền được tham chiếu ngược lại.
4. `SELECT * FROM voucher_links WHERE invoice_id = '<id hóa đơn>'` → đúng một dòng,
   `relation = 'REFUNDED_BY'`.
5. Chạy lại sự kiện hủy → vẫn đúng một dòng.

## In scope

- Migration bảng `voucher_links` + hai enum + unique index
- Entity và service ghi liên kết (idempotent)
- Consumer chân tiền mặt ghi liên kết cùng transaction với phiếu chi
- API chi tiết phiếu thu / phiếu chi trả `linkedVoucher`

## Not in scope

- Chân tiền gửi (A-14 — không có phiếu thu để nối)
- Hiển thị liên kết trên giao diện Backoffice — API trả dữ liệu là đủ để demo qua HTTP

## Risks

| Risk | Mitigation |
|---|---|
| Sự kiện gửi lại làm nhân bản dòng link | Unique index trên bộ khóa đầy đủ + service dùng `ON CONFLICT DO NOTHING` |
| Không tìm thấy phiếu thu gốc (hóa đơn cũ trước khi có phiếu thu POS_SALE) | Ghi log cảnh báo, vẫn tạo phiếu chi — tiền quan trọng hơn liên kết |

## Definition of done

- [ ] AC-08, AC-09, AC-10 pass
- [ ] Demo script chạy được từ đầu đến cuối
- [ ] Migration chạy được cả `run` lẫn `revert` trên DB sạch
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demoed và accepted ở gate G4
