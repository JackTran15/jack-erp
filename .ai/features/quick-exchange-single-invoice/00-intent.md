---
feature: quick-exchange-single-invoice
slug: quick-exchange-single-invoice
owner: Akenzy
created: 2026-08-14
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Gộp hoá đơn đổi trả nhanh thành một chứng từ

## Problem

Một lần "đổi trả nhanh" (không có hoá đơn gốc) trên POS hôm nay sinh ra **hai chứng từ
rời nhau, không có bất kỳ liên kết nào trong DB**:

| Chân | Chứng từ | Đường đi |
|---|---|---|
| Hàng mua thêm | `INV-…`, `type=SALE` | `POST /invoices` → `POST /invoices/:id/checkout` |
| Hàng trả lại | `RTN-…`, `type=RETURN` | `POST /invoices/returns` (`mode:"quick"`) → `POST /invoices/:id/checkout-return` |

Bốn HTTP call tuần tự, không atomic — `use-checkout-actions.ts:351-458`. Chính comment
trong code thừa nhận lý do: *"BE không có endpoint đổi 'nhanh' một chứng từ, nên ghép
1 phiếu SALE + 1 phiếu QUICK RETURN"*.

Ba hậu quả đã xác minh trên code:

| # | Hậu quả | Bằng chứng |
|---|---|---|
| a | Hỏng giữa chừng để lại đơn bán **đã thu tiền** mà không có phiếu hoàn nào. Thu ngân chỉ nhận một toast `QUICK_EXCHANGE_RETURN_FAILED_AFTER_SALE` | `use-checkout-actions.ts:449-457` |
| b | Tiền qua quỹ là **gross-in/gross-out** thay vì net: chân SALE bị ép một dòng thanh toán đủ `newSubtotal` để BE không auto-book công nợ, dù khách chỉ đưa phần chênh | `buildQuickExchangeSalePayment`, `use-checkout-actions.ts:104-118` |
| c | Kế toán không lần được cặp: hai mã từ hai bộ đếm khác nhau (`DocumentType.INVOICE` vs `DocumentType.RETURN`), không cột nào nối chúng | `checkout-invoice.service.ts:223`, `checkout-return.service.ts:227` |

Trong khi đó luồng **"đổi trả theo hoá đơn"** đã đúng từ lâu: một chứng từ `type=EXCHANGE`
chứa cả dòng `direction=IN` (trả) lẫn `direction=OUT` (mua mới) — `use-checkout-actions.ts:459-527`.
Hai luồng cùng một nghiệp vụ nhưng ra hai hình dạng dữ liệu khác nhau.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thu ngân | Đổi trả nhanh xong, tra `/invoices` thấy **hai** dòng cho một giao dịch; nếu hỏng nửa chừng thì không biết phải sửa gì | Một dòng duy nhất, mã `RTN-…`, có cả hàng trả lẫn hàng mua thêm |
| Kế toán | Một giao dịch đổi hàng ghi thành một đơn bán đủ tiền + một phiếu hoàn đủ tiền, phải tự đối chiếu hai chứng từ mới ra phần chênh thật | Một chứng từ, `netAmount`/`refundedAmount` nói thẳng phần chênh; đúng hình dạng đã quen từ đổi trả theo hoá đơn |
| Dev/QA | Hai code path cho cùng nghiệp vụ; sửa một bên quên bên kia | Một code path duy nhất cho cả hai kiểu đổi trả |

## Success signal

Chạy trên môi trường thật: đổi trả nhanh trả món A 500.000₫ + mua món B 300.000₫ →
`SELECT count(*) FROM invoices WHERE created_at > :t0` trả về đúng **1**, dòng đó có
`type='EXCHANGE'`, `net_amount = -200000`, `refunded_amount = 200000`, và
`SELECT count(*) FROM invoice_items WHERE invoice_id = :id GROUP BY direction` trả về
đúng một dòng `IN` và một dòng `OUT`. Quỹ tiền mặt giảm đúng 200.000₫ — không phải
tăng 300.000₫ rồi giảm 500.000₫ như hôm nay.

## Out of scope

- **Dữ liệu cũ.** Các cặp `INV`+`RTN` đã phát sinh giữ nguyên, không migration, không backfill liên kết (đã chốt với Akenzy 2026-08-14).
- **`DocumentType.EXCHANGE` / prefix riêng.** Đơn đổi tiếp tục lấy số từ bộ đếm `RETURN`, y như đổi trả theo hoá đơn (đã chốt).
- **Công nợ cho đổi trả nhanh.** Đổi hàng đắt hơn vẫn ép thu đủ tiền; không mở checkbox "Tính vào công nợ" cho luồng không có hoá đơn gốc (đã chốt).
- **Kiểm `returned_quantity` cho đổi trả nhanh.** Không có hoá đơn gốc thì không có gì để kiểm — giữ nguyên hành vi hiện tại.
- **Checkout saga v2** (`POST /v2/pos/checkout`, cờ `VITE_CHECKOUT_V2`). Nằm ở branch `feat/promotions`, chưa có trên `main`; coi như chưa tồn tại (đã chốt).
- **Cột "Loại hoá đơn" / lọc theo type ở `/invoices`.** DTO và handler đã hỗ trợ nhưng UI chưa dùng — việc riêng.
- **Khuyến mại trên dòng mua thêm của đơn đổi.** Trên `main`, POS không áp CTKM/voucher lên bất kỳ hoá đơn nào (A-04), nên không có gì để giữ.

## Constraints

| Kind | Detail |
|---|---|
| Base | Nhánh từ `main`. Không đụng, không tham chiếu checkout saga v2. |
| Nghiệp vụ | Chứng từ đã POSTED là bất biến — không sửa dữ liệu cũ. |
| Kỹ thuật | `ValidationPipe` global bật `forbidNonWhitelisted: true` — DTO phải khai báo đủ mọi field nhận vào. |
| Kỹ thuật | Source backend English-only; tiếng Việt chỉ ở chuỗi lỗi hiển thị và frontend. |
| Kỹ thuật | Không có migration nào trong epic này — schema đã đủ (`invoices.original_invoice_id` đã `nullable`). |
| Kiểm thử | `apps/pos-web` **không có test runner** — mọi thay đổi FE chỉ kiểm được bằng demo script chạy tay. |

## Existing surface touched

- **Tái dùng nguyên vẹn:** `ItemCostSnapshotService.snapshotCosts`, `resolveBranchItemLocations(..., { showroomOnly: true })`, `CheckoutReturnService.checkout` (đã null-safe với `originalInvoice`), `buildCheckoutReturnPayload` (ma trận hoàn tiền FE).
- **Mẫu gần nhất để bám theo:** nhánh QUICK của `create-return-invoice.service.ts:74-86` — cùng bài toán "không có hoá đơn gốc", đã chạy production.
- **Sửa:** `create-exchange-invoice.dto.ts`, `create-exchange-invoice.service.ts`, `use-checkout-actions.ts`, `returnInvoicePayloadMapper.ts`, `dtos/invoice.dto.ts`, `PaymentSection.tsx`, `checkout-session.store.ts`, `invoiceRowPrintPayload.ts`.
- **Mới:** không file backend mới nào. Chỉ nhánh `if` trong service đã có.
- **Adjacent:** luồng "đổi trả theo hoá đơn" dùng chung toàn bộ code path sau thay đổi này — mọi ticket phải chứng minh không hồi quy.
