---
feature: return-debt-refund-split
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Khoản hoàn trên phiếu trả/đổi có hoá đơn gốc **luôn** được tách tự động: trừ dư nợ hoá đơn gốc trước, phần còn lại mới chi ra quỹ thu ngân chọn. Không còn nhánh "toàn tiền mặt" | high | yes | Toàn bộ UOW-01 + UOW-02; hợp đồng `checkout-return` | confirmed | Akenzy chốt 2026-08-16 (vòng hỏi G0), phương án "Tự tách, bỏ ô checkbox" |
| A-02 | Trả **một phần** khi khoản hoàn ≤ dư nợ: toàn bộ đi giảm nợ, khách **không** nhận đồng nào. Ưu tiên trừ nợ trước, không phải chi tiền trước | high | yes | Công thức tách (UOW-01), kỳ vọng của thu ngân tại quầy | confirmed | Akenzy chốt 2026-08-16 — "Trừ nợ trước" |
| A-03 | Ô "Tính vào công nợ" (`RefundToDebtRow`) bị **gỡ khỏi luồng hoàn tiền**; `refundMethod = OFFSET` không còn do FE gửi | high | yes | UOW-03 (POS FE), `returnInvoicePayloadMapper` | confirmed | Hệ quả trực tiếp của A-01 (phương án đã chọn ghi rõ "bỏ ô checkbox") |
| A-04 | Đường huỷ hoá đơn (`cancelInvoice`) **ngoài phạm vi** lần này, kể cả nếu có cùng lỗi | high | yes | Phạm vi feature; có thể còn lỗ chi vượt ở đường huỷ | confirmed | Akenzy chốt 2026-08-16 — để feature riêng |
| A-05 | Các phiếu trả **đã post sai** trước đây không được sửa/backfill; chỉ sửa từ nay | high | yes | Số dư công nợ lịch sử vẫn sai cho tới khi xử lý thủ công | confirmed | Akenzy chốt 2026-08-16 — forward-only |
| A-06 | Không cần trần riêng theo "số tiền đã thực thu": bất biến `chi ≤ đã thực thu` **suy ra được** từ chính phép trừ-nợ-trước, vì `dư nợ = phải thu − đã thực thu` và `chi = hoàn − min(hoàn, dư nợ)`. Do đó **không** phải đọc `invoices.total_paid` (đang đóng băng) hay cộng `debt_payments` | high | no | Nếu sai, phải thêm một trần tường minh dựa trên `total_paid + Σ debt_payments` — thêm 1 ticket, không phá kiến trúc | pending | Chứng minh đại số trong `03-logical-design.md` §Bất biến; ghim bằng property test AC-07/AC-09 ở UOW-01 |
| A-07 | `refundMethod = STORE_CREDIT` giữ nguyên hành vi cũ (không tách) vì POS không phát sinh giá trị này — `returnInvoicePayloadMapper` chỉ emit CASH / BANK / OFFSET | medium | no | Nếu backoffice/API ngoài gọi STORE_CREDIT trên hoá đơn còn nợ thì vẫn hở đúng lỗi #8 ở nhánh đó | pending | Ghi chú trong `03-logical-design.md`; nếu về sau POS mở STORE_CREDIT thì mở ticket riêng |
| A-08 | Đổi hàng (`EXCHANGE`) có `netAmount < 0` đi cùng một đường và áp dụng cùng quy tắc tách | high | no | Đổi hàng lệch giá trên hoá đơn còn nợ vẫn chi vượt | pending | Cùng hàm `checkout`, cùng AC; AC-08 phủ ca EXCHANGE |
| A-09 | Trả hàng nhanh (QUICK, không có `originalInvoiceId`) giữ nguyên: không tra nợ, chi toàn bộ theo giá trị hàng trả | high | no | Trả nhanh bị chặn/chia sai | pending | AC-06 ghim hành vi cũ |
| A-10 | Thêm cột `invoices.offset_amount` (numeric 18,2, default 0) để lưu phần đã cấn trừ là chấp nhận được — migration thuần cộng cột, không phá API cũ (`refunded_amount` vẫn là tổng khoản hoàn) | medium | no | Nếu không được thêm cột thì phần cấn trừ chỉ suy ra gián tiếp từ `invoice_debts`, khó cho phiếu in và báo cáo | pending | Quyết định ở ADR-02; migration viết tay theo quy ước repo |
| A-11 | Khi phần chi ra = 0, **không** phát `CASH_REFUND` / `DEPOSIT_REFUND` → không sinh phiếu chi rỗng | high | no | Sổ quỹ có phiếu chi 0đ | pending | AC-12 |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-R1 | (Từ feature `promotion-qa-defects`, A-02 cũ) Có thể kẹp khoản hoàn theo `invoices.total_paid` | `total_paid` đóng băng lúc checkout; tiền trả nợ chỉ ghi vào `debt_payments`. Hoá đơn bán chịu đã trả hết vẫn đọc `total_paid = 0` | Kẹp theo `total_paid` sẽ hoàn **0đ** cho khách đã trả hết nợ. Cách tiếp cận bị loại; thay bằng phép trừ-nợ-trước (A-06), không đọc `total_paid` |
| A-R2 | `refundMethod = OFFSET` là lời giải cho ca hoá đơn còn nợ | OFFSET đẩy **toàn bộ** khoản hoàn vào cấn trừ: `applied = min(hoàn, dư nợ)`, phần chênh khách đã thực trả bị nuốt, không chi cũng không ghi nhận | OFFSET không còn là một lựa chọn thu ngân; nó trở thành **trạng thái dẫn xuất** của phép tách khi phần chi ra = 0 (ADR-01) |
