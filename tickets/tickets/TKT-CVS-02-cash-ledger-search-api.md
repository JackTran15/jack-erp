# TKT-CVS-02 BE: refactor `CashLedgerService` + `POST /v2/cash-ledger/search`

## Epic

[EPIC-21072026 Tiền mặt — gộp 1 API tìm kiếm thu/chi + lọc theo cột cho sổ quỹ](../epics/EPIC-21072026-cash-voucher-ledger-search.md)

## Summary

Sổ quỹ tiền mặt không lọc được theo cột vì `description` / `counterparty` được resolve **sau** truy
vấn trang bằng một Map JS (`loadVouchers`) — SQL không nhìn thấy chúng. Chuyển phần resolve đó vào
SQL bằng `LEFT JOIN LATERAL` (đúng cách `DepositLedgerService.buildLegsSql` làm), gom thành **một**
hàm dựng row-stream mà cả 5 entry point cùng dùng, rồi thêm endpoint v2 lọc theo cột.

## Deliverables

- `apps/api/src/modules/accounting/cash-vouchers/cash-ledger/cash-ledger.service.ts` — refactor.
- `.../cash-ledger/dto/cash-ledger-search-v2.dto.ts` — `CashLedgerSearchV2Dto`.
- `.../cash-ledger/queries/search-cash-ledger-v2.query.ts` + `.handler.ts` — handler **mỏng**, ủy
  quyền cho service.
- `.../cash-ledger/controllers/cash-ledger-v2.controller.ts`.
- `.../cash-vouchers/cash-vouchers.module.ts` — đăng ký controller + handler.
- `.../cash-ledger/cash-ledger.service.spec.ts` — mở rộng.

## Acceptance Criteria

- [ ] `POST /v2/cash-ledger/search` trả đúng shape `CashLedgerResult` như v1 (FE mapping không đổi).
- [ ] `GET /cash-ledger` (v1) trở thành adapter gọi `search()` — một implementation duy nhất, không
      thể lệch nhau.
- [ ] Cả 5 entry point (opening, count, sum in/out, sum-before-offset, page rows) đi qua **cùng**
      `buildRowsSql`, nên lưới và tổng không bao giờ bất đồng.
- [ ] Số dư đầu kỳ chỉ nhận **cắt theo ngày**, không nhận bộ lọc cột (nó là số dư thật của quỹ khi
      bước vào kỳ). Ghi chú rõ trong code: khi có bộ lọc, `opening + in − out` ≠ số dư cuối thật.
- [ ] Giữ `ORDER BY m.created_at ASC, m.id ASC` — thứ tự tăng dần là điều kiện đúng của số dư lũy kế.
- [ ] `LEFT JOIN LATERAL … LIMIT 1` (không phải join thường): join thường sẽ nhân đôi dòng sổ và làm
      hỏng số dư lũy kế nếu quan hệ 1:1 vỡ.
- [ ] LATERAL loại chứng từ đã xóa mềm (`deleted_at IS NULL`) — giữ nguyên hành vi của
      `loadVouchers` (TypeORM `find` tự loại soft-delete).
- [ ] Bộ lọc: `createdAt` (date-range), `documentNumber`, `description`, `counterparty`, `staff`
      (chuỗi), `amountIn` / `amountOut` (compare, mỗi cái cũng ràng buộc chiều tiền).
- [ ] `balance` (số dư lũy kế) **không** lọc được — nó tính theo trang từ dòng đã sắp xếp, không phải
      giá trị lưu trữ.
- [ ] Dùng lại `@RequirePermission('accounting.cash_ledger.read')`.
- [ ] Xóa `loadVouchers()` + interface `VoucherInfo` (chết sau refactor).
- [ ] Chuyển `NO_VOUCHER_LABEL = '(Chưa có chứng từ)'` sang FE — backend trả
      `voucherNumber: string | null`. (Chuỗi tiếng Việt trong source backend vi phạm quy ước dự án;
      ticket này viết lại đúng đoạn code đó.)

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh (chạy **toàn bộ** suite — service này dùng chung).
- [ ] Spec có ca hồi quy: số dư lũy kế + tổng in/out **không đổi** khi không có bộ lọc.
- [ ] `GET /cash-ledger` cho cùng tham số trả kết quả giống hệt trước refactor.
- [ ] Không đổi schema.
- [ ] Không còn tiếng Việt trong source backend của module này.

## Tech Approach

```ts
export interface LedgerFilters {
  from?: string; to?: string; beforeDate?: string;
  documentNumber?: StringFilterDto;
  description?: StringFilterDto;
  counterparty?: StringFilterDto;
  staff?: StringFilterDto;
  amountIn?: CompareFilterDto;
  amountOut?: CompareFilterDto;
}

private buildRowsSql(accountId, org, branchId, filters): { sql: string; params: unknown[] }
```

- Nền: `FROM cash_movements m`, giữ nguyên vị từ hiện có — `m.organization_id = $2`,
  `(m.cash_account_id = $1 OR m.to_account_id = $1)`, branch tùy chọn, và mốc ngày trên
  `m.created_at`. `cash_movements` **không có** `doc_date`; `created_at` chính là ngày của sổ và
  cũng là thứ lưới đang render.
- `LEFT JOIN LATERAL (SELECT … FROM cash_receipts cr WHERE cr.cash_movement_id = m.id AND
  cr.deleted_at IS NULL LIMIT 1) cr ON true` và tương tự cho `cash_payments`.
- `LEFT JOIN users su ON su.id = COALESCE(cr.staff_id, cp.staff_id)
  AND su.organization_id::text = m.organization_id` — bắt buộc có `::text`:
  `BaseEntity.organizationId` không khai kiểu (varchar) còn `users.organization_id` là uuid. Đúng
  cast mà `DepositLedgerService` đang dùng.
- Cột dẫn xuất: `voucher_id`, `voucher_number`, `kind` (`'PT'`/`'PC'`/`'Khác'`),
  `description = COALESCE(cr.reason, cp.reason, m.notes)`,
  `counterparty = COALESCE(cr.payer_name, cp.payee_name, cr.partner_name_snapshot,
  cp.partner_name_snapshot)`, `staff`, và `signed` từ `signedCase()` sẵn có.
- Bộ lọc trên các alias dẫn xuất chạy ở lớp ngoài (`SELECT * FROM (…) filtered WHERE …`) bằng đúng
  các helper `applyString` / `applyCompare` của `DepositLedgerService` — `amountIn` so `signed` khi
  dương, `amountOut` so `-signed` khi âm, nên mỗi bộ lọc cũng ràng buộc chiều tiền.

DTO v2: `page`, `limit`, `cashAccountId?`, `createdAt?`, `documentNumber?`, `description?`,
`counterparty?`, `staff?`, `amountIn?`, `amountOut?`. **Không** có `accountNo` (một két/chi nhánh)
và **không** có `reconStatus` (tiền mặt không đối chiếu) — đó là toàn bộ khác biệt so với DTO sổ
tiền gửi.

Handler mỏng và ủy quyền cho service — cùng lý do `SearchDepositLedgerV2Handler` ghi: 5 entry point
SQL phải nhìn thấy **một** row-stream giống hệt nhau, và v1 cũng chạy qua đúng code đó; nhân đôi
logic vào handler là mở đường cho hai bản lệch nhau.

## Testing Strategy

- Unit `cash-ledger.service.spec.ts`: (1) hồi quy — không lọc thì số dư lũy kế/tổng giữ nguyên;
  (2) từng bộ lọc mới; (3) `staff` resolve từ `staff_id`; (4) opening bỏ qua bộ lọc cột;
  (5) TRANSFER hiện ở cả sổ két nguồn và két đích.

## Dependencies

- Depends on: —
- Blocks: TKT-CVS-03, TKT-CVS-05
