---
id: UOW-04
slug: voucher-attachments
title: Đính kèm và tải về tài liệu trên 7 loại chứng từ
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-13, AC-14, AC-15, AC-16, AC-17]
risk: high
status: todo
rollback: Revert các commit của UoW. `attachmentIds` quay về nhận UUID bất kỳ như trước; file đã tải lên vẫn nằm trong bucket riêng tư và không ai lấy được link
---

# UOW-04 — Đính kèm và tải về tài liệu trên 7 loại chứng từ

## Demo script
1. Mở một phiếu nhập kho nháp, bấm "Tài liệu đính kèm", chọn 1 PDF ~3 MB, lưu
2. Đóng, mở lại phiếu → thấy file với tên gốc và kích thước; bấm tải về → trình duyệt tải file, so checksum với file gốc
3. Ghi sổ phiếu, mở lại, đính kèm thêm 1 ảnh và gỡ PDF, lưu → phiếu chỉ còn ảnh (A-26)
4. Lặp bước 1–2 trên một phiếu thu tiền mặt
5. Đăng nhập tài khoản không có quyền xem phiếu thu, gọi `GET /media/:id/download-url` với id file của phiếu thu đó → 403
6. Mở một phiếu thu đã đảo (`REVERSED`) → ô đính kèm chỉ đọc; gọi thẳng API sửa `attachmentIds` → bị từ chối như mọi yêu cầu sửa phiếu ở trạng thái đó
7. Chọn một file `.svg` → thông báo lỗi tiếng Việt, không có request tải lên
8. Mở lần lượt lệnh chuyển kho, phiếu chuyển kho, phiếu chi tiền mặt, phiếu thu/chi ngân hàng → mỗi loại đính kèm và mở lại được một file

## In scope
- Registry reader và `GET /media/:id/download-url`
- 7 service chứng từ: kiểm và đồng bộ `attachmentIds`, trả `attachments`, đăng ký reader
- Component danh sách đính kèm dùng chung, thay nút bị disable ở 7 dialog

## Not in scope
- Phiếu xuất kho, kiểm kê, kiểm quỹ (A-14)
- Sửa lỗ hổng phạm vi chi nhánh sẵn có của màn xem chứng từ (ADR-06)

## Risks

| Risk | Mitigation |
|---|---|
| `attachment_ids` hiện có thể chứa UUID rác (A-16) — lần sửa đầu tiên của phiếu đó sẽ bị `MEDIA_NOT_FOUND` | T-04-02..05 đếm trên DB trước khi bắt đầu; nếu > 0 thì dừng và thêm migration dọn |
| Hai đường tạo song song (legacy + v2) cho phiếu nhập kho và phiếu chuyển kho | T-04-02 và T-04-03 phải sửa cả hai đường; test cho cả hai |
| `GET`/`PATCH` của lệnh chuyển kho và phiếu chuyển kho không có decorator phạm vi chi nhánh | ADR-06 kế thừa đúng phạm vi của màn xem; ghi lại, không sửa trong feature này |
| 7 dialog copy-paste khác nhau (`FieldRow` vs `FormField`) | Một component dùng chung (T-04-06), mỗi dialog chỉ thay đúng một hàng |
| **Đã xử lý trong reader** (security review T-04-02, T-04-04, T-04-05, 2026-09-14): `GET /media/:id/download-url` không chạy `BranchScopeGuard`, trong khi `GET :id` của phiếu nhập kho, phiếu thu/chi tiền mặt, phiếu thu/chi ngân hàng có `@RequireBranchScope()`. Người dùng còn quyền đọc nhưng không còn chi nhánh hợp lệ từng lấy được link | Reader của 5 loại đó trả `false` khi `!actor.branchId || !actor.branchIds?.includes(actor.branchId)`, khớp guard (T-04-02, T-04-04, T-04-05). Lệnh chuyển kho và phiếu chuyển kho: `GET :id` không có `@RequireBranchScope()` nên reader không thêm kiểm tra (T-04-03); lệnh chuyển kho vẫn kế thừa `assertParticipantBranch` qua `getById`. Còn lại, có từ trước và ngoài phạm vi: tìm kiếm v2 phiếu nhập kho trả `attachmentIds` toàn tổ chức cho người dùng không có chi nhánh |
| **Follow-up, chưa có ticket** (security review T-04-05, 2026-09-14): design hứa xoá chủ sở hữu thì gọi `detachAll` (A-19), nhưng không ticket nào của UOW-04 giao việc này. Chứng từ xoá mềm (phiếu thu/chi tiền mặt và ngân hàng), và phiếu nhập kho bị `cancel()` (security review T-04-02), vẫn giữ media `ATTACHED`, nên file tài chính nằm mãi trong bucket riêng tư. Không lộ quyền: reader trả `false` cho chứng từ đã xoá | Sau `softDelete` (và `cancel()` nếu quyết định gỡ khi huỷ) của từng loại chứng từ, gọi `mediaLink.detachAll(ownerType, id, organizationId, manager)` trong cùng transaction; cần ticket riêng |
| **Follow-up, chưa có ticket** (security re-check T-04-02, 2026-09-14): trong `createAndPost` của phiếu nhập kho, (1) nếu transaction dọn nháp (`detachAll` + xoá) lỗi thì lỗi đó che mất lỗi gốc của `post()`, client nhận 500 chung; (2) có từ trước feature: `post()` commit rồi mới publish Kafka, publish lỗi thì `createAndPost` lại dọn một phiếu đã POSTED (phiếu không ghi nợ bị xoá nhưng sổ kho, bút toán, quỹ vẫn còn; client được bảo thử lại, có thể ghi sổ hai lần) | (1) bọc bước dọn trong try/catch, log cả hai lỗi kèm id nháp, ném lại lỗi gốc; (2) ticket riêng: chỉ xoá khi còn DRAFT, hoặc chuyển event sang outbox |
| **Follow-up, chưa có ticket, có từ trước feature** (security review T-04-03, 2026-09-14): (1) `update()` của lệnh chuyển kho và phiếu chuyển kho kiểm trạng thái trên dòng đọc ngoài transaction; nếu hoàn tất hoặc huỷ commit xen vào, `syncOwner` có thể đổi đính kèm của chứng từ COMPLETED/CANCELLED, và `manager.save(to)` có thể ghi đè trạng thái cũ. (2) Với `allowNegative: true` (mặc định của backoffice), `post()` commit sổ kho và publish event trước khi đổi trạng thái; lỗi sau đó làm `createAndPost` xoá phiếu đã có dòng sổ kho (nay kèm gỡ file) | (1) đọc lại dòng `FOR UPDATE` trong transaction và kiểm lại trạng thái trước khi sync; (2) chỉ xoá khi còn DRAFT và chưa có dòng sổ kho; cả hai cần ticket riêng |
| **Follow-up, chưa có ticket, có từ trước feature** (T-04-09, 2026-09-14; đã kiểm trên `743b485a`): (1) `create-goods-receipt-v2.handler.ts` truyền `this.dataSource.manager` (không có transaction) vào `DocumentNumberingService.generate`, hàm này khoá `pessimistic_write`, nên mọi `POST /v2/goods-receipts` trả 500 `PessimisticLockTransactionRequiredError`: hiện không có đường HTTP nào tạo được phiếu nhập kho nháp. (2) `CreateGoodsReceiptV2Dto.counterpartyId` thiếu `@IsOptional()`, request không gửi trường này bị 400 | (1) chạy lấy số và ghi phiếu trong cùng một transaction và truyền manager của transaction đó; kiểm xem dialog phiếu nhập kho có gọi endpoint v2 không. (2) thêm `@IsOptional()`. Cả hai cần ticket riêng |
| **Follow-up, chưa có ticket, có từ trước feature** (T-04-08, 2026-09-14): backoffice không có bộ chạy test. Script `test` của `@erp/backoffice-web` là `echo test`, workspace không cài vitest, và `tsconfig.json` loại `*.test.ts` khỏi `tsc`. Vì vậy `cash-vouchers.api-body.test.ts`, gồm 4 test mới cho `attachmentIds`, chưa từng chạy hay được type-check | Thêm vitest cho backoffice-web và chạy trong CI; cần ticket riêng vì đổi `package.json` và lockfile |
| **Follow-up, chưa có ticket** (T-04-07, 2026-09-14): trong dialog phiếu nhập kho, nếu người dùng đính kèm file lúc tạo mới rồi mới chọn "Chọn chứng từ điều chuyển", dialog chuyển sang lưu qua `POST /inventory/transfer-orders/:id/import`. `ImportTransferOrderDto` không có `attachmentIds`, nên ô đính kèm hiện "Loại chứng từ này chưa hỗ trợ đính kèm" và file vừa tải lên không được gắn. Không mất dữ liệu đã lưu: media còn `UPLOADED` và job dọn xoá sau 24 giờ (A-18) | Hoặc thêm `attachmentIds` cho đường nhập từ điều chuyển, hoặc khoá nút chọn chứng từ điều chuyển khi đã có file đính kèm; cần ticket riêng |

## Definition of done
- [ ] AC-13, AC-14, AC-15, AC-16, AC-17 pass
- [ ] Cả 7 loại chứng từ đính kèm và mở lại được file trong demo
- [x] Số dòng `attachment_ids <> '[]'` của 7 bảng được ghi lại trước khi bắt đầu
  - 2026-09-14 trên `erp_dev`, trước khi code: goods_receipts 0 (T-04-02); transfer_orders 0, stock_transfers 0 (T-04-03); cash_receipts 0, cash_payments 0 (T-04-04); bank_receipts 0, bank_payments 0 (T-04-05). Production chưa đo; phải đo lại trước khi triển khai (runbook T-05-02).
- [ ] `pnpm --filter @erp/api test`, `pnpm --filter @erp/api test:e2e`, `pnpm --filter @erp/backoffice-web build` xanh
  - 2026-09-15, sau commit `02188595` (sửa resolution của rebase lên `origin/main` 75165d50): unit 398/398 suite pass (gồm 4 spec chứng từ được khôi phục `staffResolver` của main); backoffice `✓ built in 5.21s`. e2e: xem ghi chú cùng ngày ở UOW-01 — `media-attachments` PASS (53.9 s), bộ đầy đủ 50 PASS · 38 FAIL, không xanh toàn bộ trên cả hai nhánh nên ô này chưa tick; ô "Trước merge — e2e" bên dưới là phép thử thay thế.
- [ ] Demo và nghiệm thu tại gate G4
- [x] **Trước merge — client** (T-04-01): sau khi rebase lên `main`, `schema.ts` + `openapi.snapshot.json` được sinh lại
  (cùng một lần sinh với UOW-01 và UOW-03) và có `GET /media/{id}/download-url`.
  - 2026-09-15, sau commit `02188595` (sửa resolution của rebase lên `origin/main` 75165d50): một lần sinh chung, commit `02188595`; `"/media/{id}/download-url"` có mặt ở `openapi.snapshot.json` và `schema.ts` (dòng 8805). Snapshot ở HEAD trước đó **không** có path này.
- [ ] **Trước merge — trình duyệt** (T-04-07, T-04-08): với phiên đăng nhập có quyền ghi và đọc từng loại chứng từ, mỗi dialog trong 7 dialog đính kèm 1 file, lưu, mở lại thấy file và tải về được, so checksum với file gốc (AC-13, AC-14); chứng từ ở trạng thái kết thúc hoặc đã đảo hiện danh sách chỉ đọc; nút lưu bị khoá khi đang tải file.
- [x] **Trước merge — e2e** (T-04-09): chạy toàn bộ e2e trên `main` và trên nhánh, cùng lượt với UOW-01 và UOW-02; không suite nào PASS trên `main` mà FAIL trên nhánh.
  - Lượt nhánh: xem ghi chú cùng ngày ở UOW-01 (`media-attachments` PASS; 7 suite chứng từ/kho FAIL với 400/404/`line_no` không liên quan media — tất cả cũng FAIL trên `main`).
  - 2026-09-16, baseline `origin/main` 75165d50 trong worktree riêng, cùng env (`MEDIA_S3_ENDPOINT=http://127.0.0.1:1`, không API dev, `--max-old-space-size=8192`, 8 520 s): 86 suite → 31 PASS · 54 FAIL · 1 skipped. Nhánh (`02188595`): 89 suite → 50 PASS · 38 FAIL · 1 skipped. Đối chiếu từng suite: **PASS trên `main` → FAIL trên nhánh: không có** — suite duy nhất nghi ngờ là `checkout-saga-promotion` (FAIL vì `Exceeded timeout of 180000 ms for a hook`, suite thứ 84 ngay trước khi lượt nhánh chết OOM), chạy lại một mình trên nhánh → PASS 13/13 trong 84 s (main: 90 s). FAIL trên `main` → PASS trên nhánh: 17 suite (api-key-admin, api-key-guard, checkout-saga-voucher, checkout-voucher-party, deposit-fund-spending, identity-cache, inventory-item-out-of-stock, inventory-item-search-v2, partner-catalog, stock-transfer-line-no, stock-transfer-lines-search, transfer-order-line-no, transfer-order-lines-search, treasury-voucher-address, untracked-location-visibility, user-branch-scope, voucher-revision-projection). 3 suite chỉ có trên nhánh (`media-upload`, `media-product-images`, `media-attachments`) đều PASS.
