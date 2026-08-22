---
feature: invoice-number-format
slug: invoice-number-format
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Số hoá đơn in ra phải là số thật, theo định dạng YYMMDDxxxx

## Problem

Tờ hoá đơn khách cầm về và hoá đơn trong hệ thống **mang hai con số khác nhau**.

Ảnh QA #16 chụp cùng một chứng từ: giấy in ra `Số: 2608212068`, còn màn hình chi tiết hoá
đơn ghi `Số: RTN-202608-00035`. Không phải lệch định dạng — mà là **hai con số không liên
quan gì tới nhau**: `apps/pos-web/src/lib/page-libs/checkout/checkoutReceiptFactory.ts:23`
sinh số in bằng `Math.random()` ngay trên máy thu ngân, chưa từng gửi lên server và không
được lưu ở đâu cả.

Hệ quả với người dùng thật:

- Khách mang giấy tới đổi trả, thu ngân gõ `2608212068` vào ô tìm hoá đơn → không ra gì.
- Hai hoá đơn khác nhau trong cùng một ngày có thể in ra **cùng một số** (4 chữ số random,
  ~0,01% mỗi cặp, và tăng theo bình phương số hoá đơn/ngày).
- In lại từ danh sách hoá đơn dùng `invoice.code` thật (`invoiceRowPrintPayload.ts:101`),
  nên **tờ in lại không bao giờ khớp tờ in lúc thanh toán** của cùng một hoá đơn.

Định dạng hệ thống đang dùng (`INV-202608-00013`) cũng không phải thứ cửa hàng muốn đọc
trên giấy: dài, có dấu gạch, và không cho biết ngày.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thu ngân POS | In tờ giấy mang số ngẫu nhiên; tra lại số đó thì không ra hoá đơn nào | Số trên giấy tra ra đúng hoá đơn đó |
| Khách hàng | Cầm về tờ giấy có số không tồn tại trong hệ thống | Số trên giấy là số chính thức, dùng để đổi trả |
| Kế toán | Đối chiếu giấy ↔ hệ thống phải dò theo ngày + số tiền | Đối chiếu bằng đúng một mã |

## Success signal

Với mọi hoá đơn tạo mới sau khi triển khai: số in trên phiếu lúc thanh toán ≡ `invoices.code`
≡ số hiển thị ở màn hình chi tiết ≡ số in lại từ danh sách hoá đơn — và cả bốn đều có dạng
`YYMMDDxxxx` (bán hàng) hoặc `YYMMDDxxxxTH` (trả/đổi hàng).

## Out of scope

- **Không đổi mã của hoá đơn cũ.** Chứng từ đã ghi sổ là bất biến; `INV-202608-00013` đã in
  ra giấy và đã nằm trong báo cáo, sổ cái, phiếu thu — viết lại là làm hỏng dữ liệu lịch sử.
- **Không đụng các loại chứng từ khác** (PT, PC, NK, XK, CK, KH, NV…). Câu hỏi QA #16 chỉ
  nói về số hoá đơn; đổi 28 loại còn lại là một phạm vi khác hẳn.
- **Không thêm đoạn phân biệt chi nhánh vào mã.** Bộ đếm dùng chung toàn công ty (quyết định
  của người dùng), nên mã vẫn đúng dạng `YYMMDDxxxx` không hậu tố chi nhánh.
- **Không sửa phiếu tạm tính.** "HÓA ĐƠN TẠM TÍNH" in trước khi hoá đơn tồn tại nên chưa thể
  có số thật — xử lý riêng ở UOW-03, không phải bằng cách sinh số giả.
- **Không chuyển sang Postgres SEQUENCE.** Vấn đề hiệu năng của bộ đếm là giai đoạn 2 của
  `document-numbering`, độc lập với định dạng.

## Constraints

| Kind | Detail |
|---|---|
| Dữ liệu | `uq_invoice_org_code` là UNIQUE `(organization_id, code)` — mã trùng ném 23505, làm hỏng cả giao dịch thanh toán |
| Bất biến | Hoá đơn đã ghi sổ không được sửa mã (quy tắc CLAUDE.md: chứng từ đã post là immutable) |
| Kỹ thuật | `formatDocumentNumber` hiện luôn nối các đoạn bằng `-`, và `formatDate` không có `YYMMDD` |
| Cấu hình | Rule đánh số nằm trong bảng `document_number_rules` trên từng org — đổi mặc định trong code KHÔNG tự đổi rule đã tồn tại |
| Đa chi nhánh | Prod có nhiều chi nhánh (MT211 Đà Nẵng, Cần Thơ…) cùng một org |

## Existing surface touched

- `apps/api/src/modules/document-numbering/` — `document-numbering.service.ts`
  (`DEFAULT_DOC_NUMBER_CONFIG`, `formatDocumentNumber`, `formatDate`,
  `ensureDefaultActiveRule`), `document-number-rule.entity.ts`
- `apps/api/src/modules/pos/` — `checkout-saga/application/steps/next-document-number.step.ts`
  (DocumentType.INVOICE), `services/checkout-return.service.ts:246` (DocumentType.RETURN)
- `apps/pos-web/src/lib/page-libs/checkout/checkoutReceiptFactory.ts` — nguồn số ngẫu nhiên
- `apps/pos-web/src/hooks/page-hooks/checkout/use-checkout-actions.ts` — nơi đã có sẵn nếp
  vá `receiptPayload.totals.*` từ response sau checkout
- `apps/backoffice-web/src/pages/settings/DocumentNumberingPage.tsx` — form + preview rule
- Migration mới trong `apps/api/src/database/migrations/`
