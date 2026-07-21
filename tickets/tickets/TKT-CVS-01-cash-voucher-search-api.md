# TKT-CVS-01 BE: `POST /v2/cash-vouchers/search` — gộp phiếu thu + phiếu chi thành 1 API

## Epic

[EPIC-21072026 Tiền mặt — gộp 1 API tìm kiếm thu/chi + lọc theo cột cho sổ quỹ](../epics/EPIC-21072026-cash-voucher-ledger-search.md)

## Summary

Thay 2 lời gọi `GET /cash-receipts` + `GET /cash-payments` (mà FE đang gộp trong trình duyệt) bằng
một endpoint CQRS duy nhất trả về một dòng dữ liệu hợp nhất, có lọc theo từng cột, sắp xếp
`created_at DESC`, phân trang và `SUM(total_amount)` trên **toàn bộ** tập đã lọc.

`cash_receipts` và `cash_payments` là hai bảng không chung entity, nên — y hệt
`SearchDepositVouchersV2Handler` — đây là **UNION ALL CTE bằng SQL thô**, không phải `FilterBuilder`
trên `SelectQueryBuilder` (FilterBuilder cần một `SelectQueryBuilder<Entity>` và không span được 2
bảng).

## Deliverables

- `apps/api/src/modules/accounting/cash-vouchers/enums.ts` — thêm
  `CashVoucherKind { RECEIPT, PAYMENT }` và
  `CashVoucherDocumentKind { CASH_RECEIPT, CASH_PAYMENT, GOODS_RECEIPT_PAYMENT }`.
- `.../cash-vouchers/dto/cash-voucher-search-v2.dto.ts` — `CashVoucherSearchV2Dto`,
  `CashVoucherRowDto`, `CashVoucherSearchV2ResponseDto` (class-validator + `@ApiProperty`).
- `.../cash-vouchers/queries/search-cash-vouchers-v2.query.ts` — data carrier `(dto, actor)`.
- `.../cash-vouchers/queries/search-cash-vouchers-v2.handler.ts` — toàn bộ logic.
- `.../cash-vouchers/queries/search-cash-vouchers-v2.handler.spec.ts`.
- `.../cash-vouchers/controllers/cash-voucher-v2.controller.ts` — dispatcher mỏng.
- `.../cash-vouchers/cash-vouchers.module.ts` — `CqrsModule` vào `imports`, controller vào
  `controllers`, handler vào `providers`.

## Acceptance Criteria

- [ ] `POST /v2/cash-vouchers/search` trả `{ data, total, page, limit, totalAmount }`.
- [ ] Mọi truy vấn lọc `organization_id` từ actor, `deleted_at IS NULL`, và `branch_id` khi
      `actor.branchId` có — áp dụng **bên trong cả hai nhánh UNION** (khác v1, vốn bỏ filter branch
      khi truyền `cashAccountId`).
- [ ] `cashAccountId` là tùy chọn; vắng mặt = mọi két trong phạm vi chi nhánh.
- [ ] `ORDER BY "createdAt" DESC, id DESC`.
- [ ] `totalAmount` trong envelope là `SUM` trên toàn bộ tập đã lọc, **không** phải tổng của trang.
- [ ] `documentKind` 3 giá trị; `GOODS_RECEIPT_PAYMENT` suy ra từ
      `cash_payments.reference_type::text = 'GOODS_RECEIPT'`.
- [ ] Bộ lọc hỗ trợ đủ: `createdAt` (date-range, `to` bao trọn ngày), `documentNumber`,
      `documentKind`, `status`, `totalAmount` (compare), `counterparty`, `reason`.
- [ ] DTO khai báo **mọi** field được nhận (global `whitelist` + `forbidNonWhitelisted`);
      `page`/`limit` chặn `@Min`/`@Max`.
- [ ] Ký tự `%` `_` `\` trong giá trị lọc chuỗi được escape để match theo nghĩa đen.
- [ ] Dùng lại `@RequirePermission('accounting.cash_receipt.read')` — **không** thêm key mới.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` và `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: scope org, scope branch, `cashAccountId`, từng operator chuỗi, compare tiền,
      date-range, `documentKind` 3 giá trị, thứ tự `createdAt`, `totalAmount` toàn tập.
- [ ] Không đổi schema; `synchronize` vẫn false.
- [ ] Không có tiếng Việt trong source backend.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// dto/cash-voucher-search-v2.dto.ts
export class CashVoucherSearchV2Dto {
  page?: number = 1;                    // @IsInt @Min(1)
  limit?: number = 20;                  // @IsInt @Min(1) @Max(100)
  cashAccountId?: string;               // @IsUUID
  createdAt?: DateRangeFilterDto;       // fed by both the period filter and the column cell
  documentNumber?: StringFilterDto;
  documentKind?: EnumFilterDto;         // CashVoucherDocumentKind
  status?: EnumFilterDto;               // CashVoucherStatus
  totalAmount?: CompareFilterDto;
  counterparty?: StringFilterDto;
  reason?: StringFilterDto;
}
```

CTE — hai cột `reference_type` dùng **hai kiểu enum Postgres khác nhau**
(`cash_receipt_reference_type_enum` vs `cash_payment_reference_type_enum`), nên cả hai vế phải
`::text` nếu không UNION không khớp kiểu (đúng cái bẫy `SearchDepositVouchersV2Handler` đã ghi chú):

```sql
WITH combined AS (
  SELECT 'CASH_RECEIPT' AS "documentKind",
         'RECEIPT'      AS kind,
         r.id, r.created_at AS "createdAt",
         r.voucher_date::text AS "voucherDate",
         r.document_number    AS "documentNumber",
         r.status::text       AS status,
         r.total_amount::float AS "totalAmount",
         r.cash_account_id    AS "cashAccountId",
         r.reference_type::text AS "referenceType",
         r.reason,
         COALESCE(NULLIF(btrim(r.payer_name), ''),
                  NULLIF(btrim(r.partner_name_snapshot), ''), '') AS counterparty
  FROM cash_receipts r
  WHERE r.organization_id = $1 AND r.deleted_at IS NULL
        [AND r.branch_id = $n] [AND r.cash_account_id = $n]
  UNION ALL
  SELECT CASE WHEN p.reference_type::text = 'GOODS_RECEIPT'
              THEN 'GOODS_RECEIPT_PAYMENT' ELSE 'CASH_PAYMENT' END,
         'PAYMENT',
         p.id, p.created_at, p.voucher_date::text, p.document_number, p.status::text,
         p.total_amount::float, p.cash_account_id, p.reference_type::text, p.reason,
         COALESCE(NULLIF(btrim(p.payee_name), ''),
                  NULLIF(btrim(p.partner_name_snapshot), ''), '')
  FROM cash_payments p
  WHERE <same scope on p>
)
```

Đơn giản hơn CTE deposit: **không** có join nhãn tài khoản (một két/chi nhánh, lưới không có cột tài
khoản), nên bộ lọc áp thẳng trên `combined` — bỏ lớp `rows AS (…)` của bản deposit.

Hai truy vấn chạy song song bằng `Promise.all`: một lấy rows (`LIMIT/OFFSET`), một lấy
`COUNT(*)::int` + `COALESCE(SUM("totalAmount"),0)::float` (một lượt scalar, không `GROUP BY`).
Lọc `createdAt` so sánh `"createdAt"::date` để `to` bao trọn ngày, khớp `FilterBuilder.applyDateRange`.

Copy nguyên các helper private `applyString` / `applyCompare` / `applyDateRange` / `applyEnum` và
map `COMPARE_SQL` từ `search-deposit-vouchers-v2.handler.ts`.

Controller — giống hệt `DepositVoucherV2Controller`:

```ts
@Controller('cash-vouchers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashVoucherV2Controller {
  @Post('search') @Version('2')
  @RequirePermission('accounting.cash_receipt.read')
  search(@Body() dto: CashVoucherSearchV2Dto, @Actor() actor: ActorContext) { … }
}
```

## Testing Strategy

- Unit `search-cash-vouchers-v2.handler.spec.ts`: mock `repo.manager.query`, khẳng định SQL sinh ra
  và tham số theo từng bộ lọc (theo khuôn `search-deposit-vouchers-v2.handler.spec.ts`).

## Dependencies

- Depends on: —
- Blocks: TKT-CVS-03, TKT-CVS-04
