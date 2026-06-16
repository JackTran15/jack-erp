# TKT-DUE-01 Schema migration + entity columns (invoice_debts.credit_days, organizations.default_credit_days)

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Hand-written migration thêm 2 cột: `invoice_debts.credit_days` (số ngày được nợ ghi nhận **per-invoice**) và `organizations.default_credit_days` (giá trị prefill cấp tổ chức). Cột `invoice_debts.due_date` **đã tồn tại** (`date NULL`, tạo ở `1778000000000-AddPosInvoiceEntities.ts`) — chỉ dùng lại, không tạo lại. Cập nhật 2 entity tương ứng. Đây là nền cho mọi ticket sau.

## Deliverables

- `apps/api/src/database/migrations/1784400000000-AddDebtCreditDaysAndOrgDefault.ts` (new) — hand-written:
  - `ALTER TABLE "invoice_debts" ADD COLUMN "credit_days" integer` (nullable).
  - `ALTER TABLE "organizations" ADD COLUMN "default_credit_days" integer` (nullable).
  - `down()`: drop cả 2 cột.
- `apps/api/src/modules/pos/entities/invoice-debt.entity.ts` — thêm cột `creditDays`.
- `apps/api/src/modules/organization/organization.entity.ts` — thêm cột `defaultCreditDays`.

## Acceptance Criteria

- [ ] `pnpm migration:run` chạy sạch; `pnpm migration:revert` đảo ngược đúng (drop 2 cột).
- [ ] Dòng `invoice_debts` cũ giữ `credit_days NULL` (không backfill); `organizations` cũ giữ `default_credit_days NULL` — không phá dữ liệu hiện có.
- [ ] `synchronize` vẫn `false`; không cột nào đổi ngoài migration.
- [ ] Entity khớp đúng tên cột snake_case + nullable.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` xanh (entity compile).
- [ ] Migration timestamp `1784400000000` > migration mới nhất (`1784300000000-BackfillDefaultLocations`).
- [ ] No Vietnamese trong source (column comment English).
- [ ] Không đụng cột `due_date` (đã có sẵn).

## Tech Approach

Migration (timestamp lớn hơn `1784300000000`):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDebtCreditDaysAndOrgDefault1784400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoice_debts" ADD COLUMN "credit_days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "organizations" ADD COLUMN "default_credit_days" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations" DROP COLUMN "default_credit_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_debts" DROP COLUMN "credit_days"`,
    );
  }
}
```

`InvoiceDebtEntity` — đặt cạnh `dueDate` đã có:

```ts
@Column({
  name: 'credit_days',
  type: 'int',
  nullable: true,
  comment: 'Credit term in days entered at checkout (per invoice). Null = open-ended.',
})
creditDays?: number | null;
```

`OrganizationEntity`:

```ts
@Column({
  name: 'default_credit_days',
  type: 'int',
  nullable: true,
  comment: 'Org-wide default credit days used to prefill the POS due-date modal.',
})
defaultCreditDays?: number | null;
```

## Testing Strategy

- Chạy `pnpm migration:run` trên DB dev rồi `pnpm migration:revert`; xác nhận schema add/drop sạch.
- Unit không bắt buộc cho riêng migration; verify gián tiếp qua spec ở TKT-DUE-08.

## Dependencies

- Depends on: —
- Blocks: TKT-DUE-02, TKT-DUE-03, TKT-DUE-04
