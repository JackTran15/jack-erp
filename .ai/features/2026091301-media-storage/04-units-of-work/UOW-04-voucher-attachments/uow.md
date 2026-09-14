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

## Definition of done
- [ ] AC-13, AC-14, AC-15, AC-16, AC-17 pass
- [ ] Cả 7 loại chứng từ đính kèm và mở lại được file trong demo
- [x] Số dòng `attachment_ids <> '[]'` của 7 bảng được ghi lại trước khi bắt đầu
  - 2026-09-14 trên `erp_dev`, trước khi code: goods_receipts 0 (T-04-02); transfer_orders 0, stock_transfers 0 (T-04-03); cash_receipts 0, cash_payments 0 (T-04-04); bank_receipts 0, bank_payments 0 (T-04-05). Production chưa đo; phải đo lại trước khi triển khai (runbook T-05-02).
- [ ] `pnpm --filter @erp/api test`, `pnpm --filter @erp/api test:e2e`, `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demo và nghiệm thu tại gate G4
- [ ] **Trước merge — client** (T-04-01): sau khi rebase lên `main`, `schema.ts` + `openapi.snapshot.json` được sinh lại
  (cùng một lần sinh với UOW-01 và UOW-03) và có `GET /media/{id}/download-url`.
