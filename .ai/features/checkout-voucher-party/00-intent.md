---
feature: checkout-voucher-party
slug: checkout-voucher-party
owner: Akenzy
created: 2026-08-14
status: draft
---

# Intent — Phiếu thu/chi sinh từ POS phải ghi rõ khách nào, ai thu

## Problem

Mọi phiếu thu và phiếu chi mà POS sinh ra đều **trống bốn ô định danh**: Đối tượng nộp,
Người nộp, Địa chỉ, Nhân viên thu. Ảnh hiện trường: `PT000152` của hoá đơn
`INV-202608-00158` chỉ có mỗi "Lý do thu" và số tiền. Kế toán mở phiếu ra không biết thu của
ai, ai thu — muốn biết thì phải bấm sang chứng từ hoá đơn rồi tra ngược.

Điều đáng nói: **cột đã có sẵn, service đã nhận sẵn**. `cash_receipts` /`cash_payments` /
`bank_receipts` / `bank_payments` đều có `partner_type`, `partner_id`,
`partner_name_snapshot`, `partner_address_snapshot`, `payer_name`/`payee_name`, và
`staff_id`(cash) / `collected_by`·`paid_by`(bank). `CashReceiptCreateAndPostArgs` và các anh
em của nó đã khai đủ sáu tham số đó, dialog backoffice đã đọc đủ cả sáu. Chỉ có **phía POS
không bao giờ truyền gì** — consumer chỉ dựng đúng `purpose / amount / reason / reference`
rồi ghi. Đây là lỗ hổng truyền dữ liệu, không phải thiếu schema.

Khảo sát code còn lộ ra một chuyện lớn hơn câu hỏi ban đầu: **checkout v2 không sinh phiếu
thu nào cả.** `post-cash.step.ts` cố ý chỉ ghi một dòng `cash_movements` trần, docblock nói
thẳng "No `cash_receipts` (Phiếu thu) voucher either" để tránh double-post GL mà v1 đang
mắc (A-26 của epic checkout-saga). Tức là hôm nay bật `VITE_CHECKOUT_V2=true` thì Sổ quỹ
**mất hẳn phiếu thu** của đơn bán, chứ không phải có phiếu mà thiếu ô. Cùng kiểu như vậy:
thanh toán không tiền mặt (chuyển khoản/thẻ/ví) chưa bao giờ sinh Phiếu thu tiền gửi, cả v1
lẫn v2 — chỉ có `deposit_movements`.

## Success signal

Mở bất kỳ phiếu thu/chi nào POS vừa sinh trong Sổ quỹ hoặc Sổ tiền gửi, bốn ô đầu đã điền:

| Ô trên phiếu | Nguồn |
|---|---|
| Đối tượng nộp/nhận | khách hàng của hoá đơn; để trống khi khách vãng lai |
| Người nộp/nhận | tên khách hàng |
| Địa chỉ | địa chỉ khách hàng; khách không có địa chỉ thì lấy địa chỉ chi nhánh |
| Nhân viên thu/chi | nhân viên bán hàng của hoá đơn (mã + tên hiển thị được) |

Và: một đơn tiền mặt chốt qua checkout v2 sinh ra **đúng một** phiếu thu POSTED, có đủ bốn ô,
**không** thêm bút toán nào so với hiện tại.

## Out of scope

- Backfill phiếu cũ. `PT000152` và mọi phiếu trước feature này vẫn trống — Akenzy chốt
  2026-08-14, cùng tiền lệ A-02 của `return-points-net-basis`.
- Sửa double-post GL của v1 (`JournalSaleConsumer` + `PosCashSaleConsumer` cùng post chân
  tiền). Đã ghi nhận từ epic checkout-saga (A-26), vẫn để nguyên; feature này không được
  làm nó nặng thêm, và cũng không chữa nó.
- Phiếu thu/chi tạo tay ở backoffice, phiếu thu nợ, phiếu chi mua hàng, phiếu chi huỷ hoá
  đơn (`invoice-cancel-refund-cash.consumer`) — không nằm trong luồng checkout.
- Thay đổi giao diện. Dialog phiếu đã đọc đủ sáu trường; nếu vẫn trống sau khi làm xong thì
  đó là lỗi backend, không phải chỗ để sửa FE.
- Đổi ngữ nghĩa cột hay thêm cột mới trên bốn bảng chứng từ.

## Constraints

- **Không được làm hỏng việc bán hàng.** Khách bị xoá, chi nhánh chưa khai địa chỉ, nhân
  viên bán hàng không gắn tài khoản — mọi thiếu hụt loại này phải để ô trống và ghi log,
  tuyệt đối không throw. Với v2 thì việc này nằm **trong** transaction checkout: một
  exception ở đây là mất cả đơn hàng tại quầy.
- `PartnerResolverService.resolve` **throw 400** khi id không tra được. Không dùng thẳng nó
  trên đường POS.
- `DocumentNumberingService.generate` mở transaction `SERIALIZABLE` riêng, không nhận
  `manager` — số phiếu nó cấp **không** rollback cùng checkout. Trong saga phải dùng
  `mintDocumentNumber(manager, ...)` (ADR-02 của checkout-saga).
- `invoices.branch_id` là **varchar**, join sang `branches` phải cast `::uuid`.
- `invoices.salesperson_id` là `employee_profiles.id`, còn ô "Nhân viên thu" trên dialog tra
  bằng `/admin/users/:id`. Ghi thẳng `salesperson_id` vào `staff_id` sẽ ra ô trống.
- Backend English-only (lỗi, comment, log, swagger); chuỗi tiếng Việt chỉ ở FE và ở phần
  `description` của chứng từ đã có tiền lệ tiếng Việt.
- Mọi consumer phải giữ nguyên tính idempotent hiện có (`processed_events` + unique
  reference index).
