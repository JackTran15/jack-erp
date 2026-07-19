# TKT-CHI-05 Test plan thủ công

## Epic

[EPIC-19072026 Phiếu chi tiền gửi — Hợp nhất theo Mục đích chi (MISA parity)](../epics/EPIC-19072026-deposit-payment-purpose-unification.md)

## Summary

Không có ticket BE, không có endpoint mới, không có E2E cần viết mới — 3 saga đích đã có test riêng (`fund-swaps.service.spec.ts`, `deposit-transfer.service.spec.ts`, `supplier-deposit-payment-saga.service.spec.ts`, đã pass). Ticket này là checklist QA thủ công cho phần FE orchestration mới, chạy trên `erp_dev` với dev-api thật.

## Deliverables

- Không có file code. Chạy checklist dưới, ghi kết quả vào PR.

## Acceptance Criteria / Checklist

| # | Bước | Kỳ vọng |
| - | ---- | ------- |
| 1 | Mở "Thêm mới Phiếu chi" tiền gửi | Mục đích chi = Khác, Hình thức chi = Chi khác (mặc định), y hệt UI trước epic |
| 2 | Tạo phiếu "Chi khác" bình thường, Lưu | Hoạt động y hệt trước epic — không hồi quy |
| 3 | Chọn Mục đích chi = Trả nợ | Nút "Chọn hóa đơn trả nợ" hiện, field thường khoá, nhãn "Nhà cung cấp" |
| 4 | Chọn NCC có công nợ mở, chọn 1-2 hoá đơn, Lưu | Công nợ giảm đúng số tiền; `bank_payments` có 1 dòng `SUPPLIER_PAYMENT`; quỹ tiền gửi trừ đúng |
| 5 | Chọn Mục đích chi = Khác → Hình thức chi = Chuyển tiền gửi thành tiền mặt | Lý do chi + dòng CHI TIẾT tự điền; checkbox tick+khoá; "Tính vào chi phí" tắt/ẩn |
| 6 | Nhập số tiền, Lưu | `deposit_movements` có 1 dòng WITHDRAWAL + `cash_movements` có 1 dòng DEPOSIT cùng số tiền; quỹ tiền gửi giảm, quỹ tiền mặt tăng đúng; phiếu xuất hiện ngay trong danh sách Thu-chi |
| 7 | Chọn Hình thức chi = Chuyển tiền gửi đến cửa hàng khác | Hiện "Cửa hàng nhận *"/"Tài khoản nhận"; Lý do chi + dòng CHI TIẾT tự điền đúng nhãn khác câu 5 |
| 8 | Chọn cửa hàng chưa có quỹ nào được gán quyền xem | Hiện cảnh báo "Không thấy tài khoản tiền gửi..." giống `DepositTransferCreateDialog` gốc |
| 9 | Chọn cửa hàng hợp lệ + tài khoản đích, nhập số tiền, Lưu | `deposit_transfers` có 1 row `DANG_CHUYEN`; quỹ nguồn giảm ngay; phiếu xuất hiện trong danh sách Thu-chi chi nhánh nguồn |
| 10 | Qua chi nhánh đích, mở `/treasury/deposit-transfers`, xác nhận nhận | Quỹ đích tăng đúng — luồng "xác nhận thủ công" không đổi so với trước epic |
| 11 | Nút toolbar "Chuyển quỹ" (đứng riêng) | Vẫn hoạt động bình thường, không bị epic này ảnh hưởng — vẫn là đường duy nhất cho chiều Tiền mặt → Tiền gửi |
| 12 | Đổi qua lại Khác/Trả nợ và giữa 3 Hình thức chi nhiều lần trước khi Lưu | Không dữ liệu cũ rò rỉ (Lý do chi, dòng CHI TIẾT, field khoá) giữa các lần đổi |
| 13 | Mở lại (View/Edit) một phiếu chi đã lưu trước đó | Hiện dạng "Chi khác" phẳng như trước epic (không cố suy ngược sub-mode gốc) — khớp quyết định trong CHI-02 |

## Definition of Done

- [ ] Cả 13 dòng trên chạy tay, kết quả ghi vào PR (pass/fail + ảnh chụp nếu fail).
- [ ] Không phát sinh lỗi console/network 500 nào trong suốt checklist.

## Testing Strategy

Thủ công, dev-api + erp_dev thật. Không viết test tự động mới (không phù hợp — backoffice-web chưa có test runner theo CLAUDE.md, và logic BE đã có test riêng).

## Dependencies

- Depends on: [TKT-CHI-03](./TKT-CHI-03-page-wiring.md), [TKT-CHI-04](./TKT-CHI-04-debt-mode-polish.md)
- Blocks: —
