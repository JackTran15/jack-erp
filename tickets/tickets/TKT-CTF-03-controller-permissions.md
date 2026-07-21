# TKT-CTF-03 `CashTransferController` + permissions + module wiring

## Epic

[EPIC-21072026 Phiếu chi tiền mặt — chuyển thành tiền gửi & chuyển đến cửa hàng khác](../epics/EPIC-21072026-cash-transfer-vouchers.md)

## Summary

Bọc `CashTransferService` bằng REST controller có guard + permission, đăng ký vào `DepositVouchersModule`, seed 4 permission key mới kèm nhãn tiếng Việt.

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/cash-transfer/cash-transfer.controller.ts` (mới).
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-vouchers.module.ts` — đăng ký controller + provider + `TypeOrmModule.forFeature([CashTransferEntity])`.
- `apps/api/src/modules/rbac/permissions.seed.ts` — 4 key mới.
- `packages/shared-interfaces/src/iam/permission-labels-vi.ts` — 4 nhãn tiếng Việt.

## Acceptance Criteria

- [ ] `@Controller('cash-transfers')` với `@UseInterceptors(AuditInterceptor)`, `@UseGuards(PermissionGuard, BranchScopeGuard)`, `@RequireBranchScope()` ở cấp class — khớp `DepositTransferController`.
- [ ] 5 route đúng permission:

  | Route | Permission |
  | ----- | ---------- |
  | `POST /cash-transfers` | `accounting.cash_transfer.create` |
  | `POST /cash-transfers/:id/confirm` | `accounting.cash_transfer.confirm` |
  | `POST /cash-transfers/:id/cancel` | `accounting.cash_transfer.cancel` |
  | `GET /cash-transfers` | `accounting.cash_transfer.read` |
  | `GET /cash-transfers/:id` | `accounting.cash_transfer.read` |

- [ ] **Không** thêm route static nào nằm dưới `/cash-transfers/` mà đứng sau `:id` — xem comment thứ tự đăng ký ở `deposit-vouchers.module.ts:64-67` (route `deposit-transfers/in-transit` từng bị `:id` + `ParseUUIDPipe` nuốt).
- [ ] `:id` dùng `ParseUUIDPipe`, đúng như `DepositTransferController`.
- [ ] 4 permission key được seed cạnh block `accounting.deposit_transfer.*` và có nhãn tiếng Việt tương ứng trong `permission-labels-vi.ts`.
- [ ] Mọi DTO có `@ApiProperty` đầy đủ; endpoint hiện đúng ở `/docs`.
- [ ] Endpoint mutation thừa hưởng `IdempotencyInterceptor` toàn cục — không tự cài lại logic dedupe.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `lint` pass.
- [ ] Chạy API, `/docs` hiển thị đủ 5 route với schema đúng.
- [ ] `pnpm seed:dev-admin` (hoặc seeder RBAC) chạy lại không lỗi và 4 permission mới xuất hiện trong bảng `permissions`.
- [ ] Gọi thử bằng token thiếu quyền → 403; thiếu header `X-Branch-Id` → lỗi từ `BranchScopeGuard`.
- [ ] Không có tiếng Việt trong source backend (Swagger description tiếng Anh; nhãn tiếng Việt chỉ ở `permission-labels-vi.ts`).

## Tech Approach

```ts
@ApiTags('Cash transfers')
@ApiBearerAuth()
@Controller('cash-transfers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashTransferController {
  constructor(private readonly service: CashTransferService) {}

  @Post()
  @RequirePermission('accounting.cash_transfer.create')
  create(@Body() dto: CreateCashTransferDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Post(':id/confirm')
  @RequirePermission('accounting.cash_transfer.confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCashTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirm(id, dto, actor);
  }

  // cancel / list / getById tương tự
}
```

Wiring trong `DepositVouchersModule`:

```ts
imports: [TypeOrmModule.forFeature([..., CashTransferEntity])],
controllers: [..., CashTransferController],
providers: [..., CashTransferService],
```

Permission seed (`permissions.seed.ts`, ngay sau block `deposit_transfer`):

```ts
{ key: "accounting.cash_transfer.create",  module: "accounting" },
{ key: "accounting.cash_transfer.confirm", module: "accounting" },
{ key: "accounting.cash_transfer.cancel",  module: "accounting" },
{ key: "accounting.cash_transfer.read",    module: "accounting" },
```

Nhãn VI (`permission-labels-vi.ts`, cạnh nhãn `deposit_transfer`):

```ts
"accounting.cash_transfer.create":  "Chuyển tiền mặt liên chi nhánh",
"accounting.cash_transfer.confirm": "Xác nhận nhận tiền mặt liên chi nhánh",
"accounting.cash_transfer.cancel":  "Huỷ chuyển tiền mặt liên chi nhánh",
"accounting.cash_transfer.read":    "Xem chuyển tiền mặt liên chi nhánh",
```

## Testing Strategy

Không unit test riêng cho controller (chỉ là lớp mỏng). Phủ bằng e2e ở [TKT-CTF-08](./TKT-CTF-08-tests.md): 403 khi thiếu quyền, 403 khi sai chi nhánh, 201 khi hợp lệ.

## Dependencies

- Depends on: [TKT-CTF-02](./TKT-CTF-02-cash-transfer-service.md)
- Blocks: [TKT-CTF-05](./TKT-CTF-05-openapi-fe-types-hooks.md)
