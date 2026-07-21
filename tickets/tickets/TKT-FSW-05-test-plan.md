# TKT-FSW-05 Test plan

## Epic

[EPIC-19072026 Chuyển quỹ — cho phép bỏ tự động sinh phiếu thu tiền mặt](../epics/EPIC-19072026-fund-swap-optional-receipt.md)

## Summary

Checklist QA thủ công trên `erp_dev` + dev-api thật, phủ cả 2 điểm vào FE và validate BE. Không cần E2E mới — thay đổi backend nhỏ, đã có unit test ở TKT-FSW-01; hai đường FE gọi chung 1 endpoint đã được unit-test.

## Deliverables

- Không có file code. Chạy checklist, ghi kết quả vào PR.

## Acceptance Criteria / Checklist

| # | Bước | Kỳ vọng |
| - | ---- | ------- |
| 1 | Mở "Thêm mới Phiếu chi" → Khác → Chuyển tiền gửi thành tiền mặt | Checkbox tick sẵn, **không** disabled |
| 2 | Bỏ tick, nhập số tiền, Lưu | `bank_payments` có 1 dòng mới (`CASH_TRANSFER`); `cash_receipts` KHÔNG có dòng mới; quỹ tiền gửi giảm đúng; quỹ tiền mặt KHÔNG đổi |
| 3 | Toast sau khi lưu (bước 2) | Nội dung phản ánh đúng — không nói "đã chuyển quỹ" nghe như đã xong cả 2 bước |
| 4 | Giữ tick, nhập số tiền, Lưu | Hành vi y hệt trước epic: cả `bank_payments` lẫn `cash_receipts` đều có dòng mới, cả 2 quỹ cập nhật đúng |
| 5 | Mở lại dialog (Thêm mới lần 2) | Checkbox trở lại trạng thái tick mặc định — không giữ trạng thái bỏ tick lần trước |
| 6 | Mở nút toolbar "Chuyển quỹ" độc lập, chiều Tiền gửi → Tiền mặt | Thấy checkbox mới (trước đây không có) |
| 7 | Bỏ tick ở (6), Lưu | Kết quả DB giống hệt bước 2 |
| 8 | Đổi chiều sang Tiền mặt → Tiền gửi (cùng dialog `FundSwapDialog`) | Checkbox biến mất, hành vi atomic như cũ |
| 9 | Gọi thẳng `POST /fund-swaps` với `direction=CASH_TO_DEPOSIT, autoCreateReceipt=false` (curl/Postman) | `400`, thông báo rõ field không áp dụng chiều này |
| 10 | Bỏ tick nhiều lần liên tiếp (2-3 phiếu) | TK 113 "Tiền đang chuyển" tích luỹ đúng số dư treo — không bị trừ nhầm hay reset |

## Definition of Done

- [ ] Cả 10 dòng trên chạy tay, kết quả ghi vào PR.
- [ ] `pnpm --filter @erp/api test -- fund-swaps` pass (unit, đã làm ở TKT-FSW-01).
- [ ] Không lỗi console/network 500 nào trong suốt checklist.

## Testing Strategy

Thủ công, dev-api + erp_dev thật; bổ sung 1 lệnh curl trực tiếp cho bước 9 (validate lỗi, khó test qua UI vì UI không cho phối hợp sai tổ hợp này).

## Dependencies

- Depends on: [TKT-FSW-03](./TKT-FSW-03-payment-dialog-checkbox.md), [TKT-FSW-04](./TKT-FSW-04-fund-swap-dialog-checkbox.md)
- Blocks: —
