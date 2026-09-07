---
feature: treasury-voucher-party-reason-edit
slug: 2026090701-treasury-voucher-party-reason-edit
owner: Akenzy
created: 2026-09-07
status: draft
---

# Intent — Phiếu thu chi quỹ tiền: đối tượng tự nhập, lý do tự điền, sửa/xoá phiếu

## Problem

Ba chỗ tắc trên màn hình **Quỹ tiền › Thu chi tiền mặt** và **Quỹ tiền › Thu chi tiền gửi**
(`/treasury/cash/receipts-expenses`, `/treasury/deposit/receipts-expenses`), áp cho cả bốn loại
phiếu: thu tiền mặt, chi tiền mặt, thu tiền gửi, chi tiền gửi.

**1 — Ô "Đối tượng" chỉ chọn được từ danh sách, gõ tay thì mất chữ.**
Người dùng chi một khoản lặt vặt cho một người không có trong danh mục (khách vãng lai, người
giao hàng thuê ngoài, một cá nhân chỉ xuất hiện đúng một lần) thì không có cách nào ghi tên
người đó lên phiếu. Ô mã cho gõ, nhưng ô tên `readOnly disabled`
(`VoucherPartnerFields.tsx:199-206`), và cái đã gõ bị vứt im lặng: `mapPartnerFields`
(`cash-vouchers.api-body.ts:13-24`) chỉ gửi `{partnerType, partnerId, staffId}`, còn
`onPartnerLookupChange` đã xoá `partnerId` từ trước nên `partnerType` cũng thành `undefined`.
Không có toast, không có lỗi — phiếu lưu xong, cột Đối tượng trống.

**2 — Lý do thu/chi phải gõ lại lần thứ hai xuống ô Diễn giải.**
Đại đa số phiếu quỹ chỉ có một dòng, và dòng đó diễn giải đúng cái vừa gõ ở ô "Lý do thu"/"Lý do
chi" phía trên. Người nhập liệu gõ cùng một câu hai lần, mỗi phiếu.

**3 — Nút "Sửa" và "Xóa" có trên thanh công cụ nhưng không bao giờ bấm được.**
Cả hai bị khoá theo `status === DRAFT` (`TreasuryCashReceiptsPage.tsx:292-295`,
`TreasuryDepositReceiptsPage.tsx:241`), trong khi mọi đường tạo phiếu đều
`createAndPostInternalInTx` ghi thẳng `status: POSTED` cùng transaction với cash movement và bút
toán. Chưa một dòng DRAFT nào từng tồn tại trong hai bảng. Hệ quả: hai nút xám vĩnh viễn với
tooltip "Chỉ sửa phiếu nháp", và đường sửa sai duy nhất là **Đảo** — sinh một phiếu đảo mang số
mới, để lại hai dòng trên sổ quỹ cho một lần gõ nhầm số tiền. Toàn bộ backend cho sửa/xoá
(`PATCH`, `DELETE`, permission `accounting.*.update` / `.delete`, service, DTO, hook FE, modal xác
nhận) **đã viết xong và đang nằm chết**.

Đây đúng là bài toán đã giải một lần cho phiếu kho ở feature `warehouse-voucher-edit-delete`
("nút Sửa trên Nhập kho và Xuất kho chết vì FE chỉ mở cho `status === DRAFT` mà mọi đường tạo
phiếu đều `createAndPost`"). Lần này là phía quỹ tiền.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| ------- | ----------------- | ----------------- |
| Kế toán quỹ / thu ngân | Gõ nhầm số tiền trên phiếu chi → bấm Đảo, sổ quỹ có 2 dòng cho 1 giao dịch, rồi tạo lại phiếu mới mang số khác | Bấm Sửa, đổi số tiền, giữ nguyên số phiếu; sổ quỹ tự khớp bằng bút toán chênh lệch |
| Kế toán quỹ | Chi tiền cho người ngoài danh mục → bỏ trống ô Đối tượng, ghi tên vào ô Lý do cho có | Chọn loại "Khác", gõ thẳng tên người nhận vào ô Đối tượng |
| Người nhập liệu | Gõ "Chi tiền điện tháng 8" hai lần: một ở Lý do chi, một ở Diễn giải dòng 1 | Gõ một lần ở Lý do chi, dòng 1 tự điền theo |

## Success signal

Trên `erp_dev`, với cùng một tài khoản kế toán quỹ, ba thao tác sau đều làm được từ giao diện
mà không phải dùng Đảo và không phải chạm database:

1. Sửa số tiền một phiếu thu **đã ghi sổ**, lưu, và số dư quỹ khớp đúng số mới — số phiếu không đổi.
2. Tạo một phiếu chi có Đối tượng là tên gõ tay, mở lại phiếu và lưới danh sách đều hiện đúng tên đó.
3. Gõ Lý do chi rồi để nguyên, dòng Diễn giải đầu tiên mang đúng câu vừa gõ khi lưu.

Kèm điều kiện chặn: script `pnpm --filter @erp/api audit:voucher-invariants` (đã có sẵn từ
`warehouse-voucher-edit-delete`) — hoặc bản mở rộng của nó sang bảng quỹ — chạy sạch trên
`erp_dev` sau khi sửa và sau khi xoá.

## Out of scope

- **In và Xuất khẩu phiếu quỹ** — Akenzy chốt 2026-09-07: nối tiếp `.ai/features/export-print/`
  (UOW-04 sẵn có, AC-14/AC-15), không nhân bản sang plan này.
- **Kiểm kê tiền mặt, Sổ chi tiết tiền mặt/tiền gửi, Chuyển tiền liên chi nhánh** — cùng nhóm
  nav nhưng khác loại chứng từ; ô Đối tượng và nút Sửa/Xoá ở đó không nằm trong khiếu nại.
- **Sửa/xoá phiếu do máy sinh** (POS bán hàng, thu nợ, trả nợ NCC, nhập hàng, đảo bút, hoán quỹ).
  Những phiếu này thuộc về saga hoặc consumer đã ghi sổ nơi khác; sửa tay sẽ phá trạng thái saga.
  Chỉ phiếu người dùng tự tạo (`purpose` = Khác) mới sửa/xoá được — xem A-02.
- **Đổi luồng tạo phiếu sang có bước DRAFT.** Đã cân nhắc và loại ở vòng hỏi G0: thêm một cú bấm
  "Ghi sổ" vào thao tác hằng ngày mà vẫn không sửa được phiếu đã ghi sổ.
- **Gộp ô Đối tượng của quỹ tiền về dùng chung `POST /v2/counterparties/search`** như bên kho.
  Hai bộ picker trùng chức năng vẫn sẽ song song tồn tại sau feature này — xem A-06.
- **Tự tạo bản ghi khách hàng/NCC khi gõ tên mới.** Đã loại ở vòng hỏi G0: làm phình danh mục
  bằng những cái tên chỉ xuất hiện một lần.

## Constraints

| Kind | Detail |
| ---- | ------ |
| Nghiệp vụ | Bút toán đã ghi sổ là bất biến (`docs/09-accounting-module.md:39-40`). Sửa phiếu phải ghi bút toán **chênh lệch**, không được UPDATE hay DELETE dòng `journal_entries` / `cash_movements` nào |
| Nghiệp vụ | Số phiếu bất biến sau khi ghi sổ (`docs/19-document-numbering-rules.md`); sửa giữ nguyên số, không mint số mới |
| Kỹ thuật | Tiền chênh lệch phải đi qua `CashPaymentsService`/`CashReceiptsService.createAndPostInternal`, **không** gọi thêm `CashService.recordMovement` — đúng hình dạng lỗi double-post đã gặp ở luồng trả hàng và ở `warehouse-voucher-edit-delete` |
| Kỹ thuật | `createAndPostInternal` chống trùng theo cặp `(referenceType, referenceId)` và `referenceId` là cột `uuid`; cặp gốc đã bị lần ghi sổ đầu chiếm — cần khoá dẫn xuất theo revision (xem `deterministicVoucherRevisionReferenceId` bên kho) |
| Kỹ thuật | Chi tiền mặt có thể chạm trần số dư quỹ; sửa tăng số tiền chi phải xử lý được lỗi "Insufficient balance" từ `recordMovement` |
| Kỹ thuật | Bốn loại phiếu nằm ở hai module với **hai enum song song** (`CashVoucherPartnerType` / `BankVoucherPartnerType`, `cash_voucher_partner_type_enum` / `bank_voucher_partner_type_enum`); mọi thay đổi phải làm hai lần hoặc trừu tượng hoá tường minh |
| Dữ liệu | `partner_id` nullable, không FK, không CHECK — `OTHER` + tên tự do không cần migration đổi kiểu enum |

## Existing surface touched

- **Tái dùng (không viết mới):** `resolvePartySnapshot` / `VoucherPartySnapshot.partnerName`
  (`cash-vouchers/shared/voucher-party.ts:20-31`, đã khai sẵn "Frozen onto partner_name_snapshot");
  `PartnerResolverService.resolve` (bỏ qua `OTHER` sẵn, `partner-resolver.service.ts:25-34`);
  `PATCH`/`DELETE` route + permission `accounting.{cash,bank}_{receipt,payment}.{update,delete}`
  (đã seed, `permissions.seed.ts:113-124`, `:156-167`); `TreasuryVoucherDialogModeEnum.EDIT` và
  đường hydrate `initial` trong cả 4 dialog; `receiptMutations.update/remove` và bốn hook anh em.
- **Khuôn mẫu bám theo:** `GoodsReceiptService.update()` / `.cancel()`
  (`inventory/goods-receipt/goods-receipt.service.ts:234-238`, `:510-514`) — "Deleting a voucher is
  the same computation as editing it, with `after = []`"; cột `revision` + khoá bi quan
  `SELECT … FOR UPDATE`; `GoodsReceiptFormDialog` cho kiểm tra sửa-được theo trạng thái kết thúc
  thay vì đòi DRAFT.
- **Feature kề bên:** `warehouse-voucher-edit-delete` (cùng bài toán, phía kho — 7 ADR dùng lại
  được); `voucher-party-branch-scope` (vừa đổi `partner-lookup.service.ts`, 2 ticket còn mở đều
  thuần test); `export-print` UOW-04 (nhận phần In/Xuất khẩu).
- **Điểm vào:** không có route mới. Hai trang danh sách sẵn có + bốn dialog sẵn có.
