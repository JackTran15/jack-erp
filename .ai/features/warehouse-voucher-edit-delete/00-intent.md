---
feature: warehouse-voucher-edit-delete
slug: warehouse-voucher-edit-delete
owner: Akenzy
created: 2026-08-17
status: draft
---

# Intent — Sửa và xoá phiếu nhập / phiếu xuất kho, đối soát chênh lệch trên sổ kho và sổ kế toán

## Problem

Thủ kho gõ sai một dòng hàng trên phiếu nhập kho thì hiện **không có đường sửa**, và
đường xoá thì để lại sổ kế toán sai.

Khảo sát mã nguồn ngày 2026-08-17 (nhánh `feat/promotions`):

1. **Nút "Sửa" là nút chết.** Cả `PurchaseOrdersPage.tsx:421` và `GoodsIssuePage.tsx:375`
   chỉ mở nút Sửa khi `status === "DRAFT"`. Nhưng mọi đường tạo phiếu đều gọi
   `createAndPost()` (`goods-receipt.controller.ts:62`, `goods-issue.controller.ts:152`,
   `transfer-order.service.ts:823/1006/1132/1149/1265/1283`), nên phiếu **luôn** sinh ra ở
   `POSTED`. Hai endpoint duy nhất tạo được DRAFT là `POST /v2/goods-receipts` và
   `POST /v2/inventory/goods-issues`, và không client nào gọi chúng. Kết quả: nút Sửa xám
   vĩnh viễn, người dùng buộc phải xoá phiếu rồi gõ lại từ đầu — mất số phiếu, mất vết ai
   sửa gì, và trong khoảng giữa hai thao tác thì tồn kho sai.
2. **Sửa cũng đang hỏng sẵn nếu mở khoá.** Phiếu nhập: FE `PATCH /goods-receipts/:id` gửi
   kèm `paymentMethod` (`GoodsReceiptFormDialog.tsx:1058`) trong khi `UpdateGoodsReceiptDto`
   không khai báo trường này, `forbidNonWhitelisted` sẽ trả 400. Phiếu xuất: **không có
   endpoint update nào** — dialog ở `mode="edit"` rơi thẳng xuống `POST /inventory/goods-issues`
   (`GoodsIssueFormDialog.tsx:873`), tức là tạo phiếu trùng thay vì sửa.
3. **Xoá phiếu nhập không đảo sổ kế toán.** `GoodsReceiptService.cancel()`
   (`goods-receipt.service.ts:277-399`) đảo tồn kho và xoá dòng nợ NCC, nhưng không đụng tới
   `journalEntryId`, không đảo cash movement đã ghi ở `:470`, không huỷ phiếu chi tự động.
   Xoá một phiếu nhập tiền mặt 10.000.000: kho trả về đúng, **quỹ vẫn hụt 10.000.000**, sổ
   cái vẫn treo DR156/CR111. Với phiếu công nợ thì dòng nợ NCC bị xoá còn TK 331 vẫn còn →
   báo cáo công nợ và sổ cái lệch nhau vĩnh viễn.
4. **Xoá phiếu xuất không có khoá chống trùng.** Phiếu nhập đã khoá row bằng
   `SELECT … FOR UPDATE` (`goods-receipt.service.ts:305`), phiếu xuất thì kiểm tra trạng thái
   ngoài transaction (`goods-issue.service.ts:290-333`) → hai request huỷ song song cùng lọt,
   ghi hai lần bút toán tăng, tồn kho cộng đôi. Không trông chờ được vào idempotency vì FE
   sinh `X-Idempotency-Key` ngẫu nhiên mỗi lần bấm (`api-axios.ts:53`).

## Affected personas

| Persona | Hiện tại | Mong muốn |
|---|---|---|
| Thủ kho | Gõ sai 1 dòng → xoá cả phiếu, gõ lại, phiếu mang số mới | Mở phiếu, sửa dòng sai, lưu; số phiếu giữ nguyên |
| Kế toán kho | Sau mỗi lần xoá phiếu nhập tiền mặt phải tự vào sổ quỹ và sổ cái gỡ tay | Xoá phiếu là sổ kho, sổ quỹ, sổ cái, nợ NCC tự về đúng |
| Kế toán tổng hợp | Đối chiếu TK 156 với báo cáo tồn kho luôn lệch bằng đúng tổng giá trị các phiếu đã xoá | Hai con số khớp nhau không cần điều chỉnh tay |

## Success signal

Trên môi trường local, với mỗi tổ hợp {phiếu nhập tiền mặt, phiếu nhập công nợ, phiếu xuất},
sửa số lượng và đơn giá của một phiếu **đã ghi sổ** rồi lưu, và xoá một phiếu đã ghi sổ, cho
kết quả: (a) số phiếu không đổi sau khi sửa, (b) tồn kho theo `stock_ledger_entries` bằng
đúng số lượng trên phiếu sau sửa, (c) số dư quỹ tiền mặt, TK 156, TK 331 và dòng
`supplier_debts` khớp với giá trị phiếu sau sửa — bằng 0 nếu phiếu đã xoá. Đo bằng e2e, mỗi
tổ hợp một kịch bản; không kịch bản nào cần thao tác xoá-tạo-lại thủ công.

## Out of scope

- **Phiếu thu / phiếu chi tiền mặt độc lập** (`modules/accounting/cash-vouchers`) — người
  dùng đã chốt phạm vi là phiếu nhập + phiếu xuất kho.
- **Ngày chứng từ xuống sổ kho** (`postedAt: new Date()` ở `stock-ledger.service.ts:180`) —
  là lỗi thật và làm báo cáo Nhập-Xuất-Tồn lệch kỳ, nhưng chạm `StockLedgerService` dùng
  chung cho POS, kiểm kê, điều chuyển; tách feature riêng.
- **Sửa/xoá bên POS** (hoá đơn bán, đổi trả) — đã có luồng huỷ riêng, không đụng tới.
- **Đổi loại thanh toán CASH ↔ CREDIT khi sửa** — đổi bản chất công nợ của phiếu, để lần sau.
- **Lịch sử phiên bản phiếu dạng xem lại được** (ai sửa gì lúc nào, diff từng lần) — feature
  này chỉ ghi vết ở mức bút toán chênh lệch trên sổ, không dựng bảng version.

## Constraints

| Kind | Detail |
|---|---|
| Quy ước repo | `CLAUDE.md`: "Business transactions (stock ledger, journal entries, posted invoices) are **immutable after posting**; corrections are done via reversal entries, not edits". Feature này cho sửa phiếu đã ghi sổ, nên phải giữ nguyên tính bất biến của **dòng sổ** (chỉ ghi thêm bút toán chênh lệch, không sửa dòng ledger cũ) và cần một ADR ghi rõ ranh giới đó. |
| Ghi sổ | Người dùng đã chốt: ghi **chênh lệch (delta)**, không đảo-toàn-bộ-rồi-ghi-lại. Số phiếu giữ nguyên. |
| Chặn nghiệp vụ | Người dùng đã chốt: **không chặn gì**, cho phép tồn âm. Ảnh hưởng tới quy tắc "chặn xoá khi nợ NCC đã có thanh toán" đang có sẵn (`goods-receipt.service.ts:348-357`) — xử lý ở A-02. |
| Migration | `synchronize: false`; mọi thay đổi schema phải qua migration viết tay (`.ai/architecture.md`, quy ước repo). |
| Idempotency | Endpoint mutation mới tự thừa hưởng `IdempotencyInterceptor`; không được tự cài lại. |
| Ngôn ngữ | Mã nguồn backend viết tiếng Anh; chuỗi hiển thị frontend tiếng Việt. |

## Existing surface touched

- **Dịch vụ nghiệp vụ:** `apps/api/src/modules/inventory/goods-receipt/goods-receipt.service.ts`,
  `apps/api/src/modules/inventory/goods-issue/goods-issue.service.ts`
- **Sổ kho:** `apps/api/src/modules/inventory/ledger/stock-ledger.service.ts`
  (`recordBatchMovements`, `getInstantAverageCost`) — dùng lại, không đổi chữ ký nếu tránh được
- **Kế toán:** `modules/accounting/journal/journal.service.ts` (`post`, `reverse`),
  `modules/accounting/cash/cash.service.ts` (`recordMovement`),
  `modules/accounting/cash/cash-fund-resolver.service.ts`,
  `modules/inventory/supplier-debt/supplier-debt.entity.ts`
- **Chứng từ quỹ:** `modules/accounting/cash-vouchers/cash-payments`, `…/cash-receipts` —
  phiếu chi bổ sung / phiếu thu hoàn cho phần tiền chênh lệch được sinh tự động qua outbox
  (A-08); bản thân màn hình phiếu thu/chi không đổi
- **Mẫu có sẵn để bám theo:** `modules/accounting/consumers/journal-reverse.consumer.ts` —
  cách POS đảo bút toán khi huỷ hoá đơn; luồng mới nên đi cùng hình dạng
- **API:** `goods-receipt.controller.ts` (`@Patch(':id')`, `@Delete(':id')`),
  `goods-issue.controller.ts` (chưa có update), hai controller CQRS v2
- **Frontend:** `apps/backoffice-web/src/components/document/GoodsReceiptFormDialog.tsx`,
  `GoodsIssueFormDialog.tsx`, `pages/purchase-orders/PurchaseOrdersPage.tsx`,
  `pages/goods-issue/GoodsIssuePage.tsx`
- **Feature liền kề:** `transfer-order.service.ts` sinh cả hai chân phiếu bằng `createAndPost`
  và có sẵn `cancelFromExportIssue` — luồng sửa phải quyết định có lan sang lệnh điều chuyển
  hay không (A-03)
