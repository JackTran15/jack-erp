# TKT-DFB-01 Schema — `deposit_transfer` header + mô hình "Tiền đang chuyển"

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

Tạo bảng header `deposit_transfer` nối 2 chân của một lần chuyển liên chi nhánh (Phiếu chi ở A ↔ Phiếu thu ở B) và mô hình hóa trạng thái trung gian **"Tiền đang chuyển"** để tổng quỹ toàn tổ chức **không bị mất** khoản đang chuyển (BR-TRF-02, ref.md R5). Các cột `transfer_pair_id` + `transfer_status(DANG_CHUYEN|HOAN_TAT)` trên `deposit_movements` **đã có sẵn từ GĐ1 (TKT-DF-01)** — ticket này **không** thêm lại, chỉ tham chiếu chúng làm điểm nối chân + cờ trạng thái. Việc bảo toàn tổng quỹ được hiện thực qua **TK 113 "Tiền đang chuyển"** làm contra cho cả 2 chân: chân A ghi `DR 113 / CR 112(A)` (tiền rời tài khoản A, đọng ở 113), chân B ghi `DR 112(B) / CR 113` (tiền vào B, xóa khỏi 113). Số dư 113 = Σ khoản `DANG_CHUYEN` = giá trị báo cáo tiền-đang-chuyển.

## Deliverables

- `apps/api/src/database/migrations/<timestamp>-DepositTransfer.ts` — migration hand-written:
  - `CREATE TYPE deposit_transfer_status AS ENUM ('DANG_CHUYEN','HOAN_TAT','DA_HUY')`.
  - `CREATE TABLE deposit_transfer` (cột dưới), UUID PK, `numeric(18,2)` cho `amount`, `created_at`/`updated_at` (UTC), `deleted_at` (soft-delete).
  - Index: `(organization_id, status)`, `(from_branch_id)`, `(to_branch_id)`, `(from_account_id)`, `(to_account_id)`, `(created_at)`.
  - **Không** đụng `deposit_movements` (các cột transfer đã tồn tại); migration chỉ verify chúng có mặt (comment ghi rõ dựa vào GĐ1).
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-transfer/deposit-transfer.entity.ts` — `DepositTransferEntity` map bảng trên.
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-transfer/enums.ts` — `DepositTransferStatus` (nếu chưa gom ở `deposit-vouchers/enums.ts` của GĐ2; ưu tiên tái dùng file enums GĐ2, chỉ thêm enum status transfer).
- `apps/api/src/modules/accounting/seeders/coa-seeder.service.ts` — **verify** TK `113` "Tiền đang chuyển" tồn tại; **thêm nếu thiếu** (cùng org, loại tài sản, parent của `1131`/`1132` nếu cần). Chỉ thêm dòng seed, không sửa account cũ.
- `apps/api/src/modules/accounting/payment-accounts/account-resolver.service.ts` — đăng ký contra mapping: purpose `INTER_BRANCH_OUT` → contra `113`, `INTER_BRANCH_IN` → contra `113` (nếu GĐ2 chưa map sẵn; nếu đã stub thì chỉ verify).

### Cột `deposit_transfer`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | uuid PK | `@PrimaryGeneratedColumn('uuid')` |
| `organization_id` | uuid | scope ORGANIZATION |
| `from_branch_id` | uuid | CN nguồn (A) |
| `to_branch_id` | uuid | CN đích (B) |
| `from_account_id` | uuid | `deposit_accounts.id` tại A |
| `to_account_id` | uuid | `deposit_accounts.id` tại B |
| `amount` | numeric(18,2) | > 0 (CHECK) |
| `status` | `deposit_transfer_status` | mặc định `DANG_CHUYEN` |
| `from_payment_id` | uuid | `bank_payments.id` chân A (set lúc create) |
| `to_receipt_id` | uuid NULL | `bank_receipts.id` chân B (set lúc confirm) |
| `transfer_pair_id` | uuid | = `id` self; dùng để nối 2 `deposit_movements` (giá trị ghi vào cột cùng tên trên movement) |
| `initiated_by` | uuid | user tạo tại A |
| `initiated_at` | timestamptz | = created_at (denormalize cho báo cáo) |
| `confirmed_by` | uuid NULL | user xác nhận tại B |
| `confirmed_at` | timestamptz NULL | |
| `cancelled_by` | uuid NULL | |
| `cancelled_at` | timestamptz NULL | |
| `cancel_reason` | text NULL | |
| `note` | text NULL | diễn giải |
| `created_at` / `updated_at` / `deleted_at` | timestamptz | UTC; soft-delete |

## Acceptance Criteria

- [ ] Migration chạy `up` tạo `deposit_transfer` + enum + index; `down` drop sạch (table → type). `synchronize` vẫn `false`.
- [ ] `amount` là `numeric(18,2)` (không float — NFR-06); CHECK `amount > 0`.
- [ ] Mọi cột id dùng UUID; `created_at`/`updated_at` UTC; `deleted_at` soft-delete.
- [ ] Migration **không** ALTER `deposit_movements` (BR: `transfer_pair_id` + `transfer_status` đã có từ GĐ1); comment nêu rõ ràng buộc phụ thuộc GĐ1.
- [ ] TK `113` "Tiền đang chuyển" tồn tại trong COA sau seed (verify hoặc thêm); contra của `INTER_BRANCH_OUT`/`INTER_BRANCH_IN` = `113` (BR-TRF-02: đây là "tài khoản trung gian" cho R5).
- [ ] `deposit_transfer_status` gồm đúng 3 giá trị `DANG_CHUYEN|HOAN_TAT|DA_HUY`; entity không dùng chuỗi tiếng Việt trong identifier (enum key English/uppercase-latin, giá trị viết-không-dấu theo convention GĐ1).
- [ ] Chạy migration trên DB đã có dữ liệu GĐ1-GĐ2 không làm hỏng bản ghi cũ (chỉ thêm bảng/seed).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] `pnpm migration:run` rồi `pnpm migration:revert` chạy sạch 2 chiều trên `erp` local.
- [ ] Không đổi schema ngoài migration; `synchronize` giữ `false`.
- [ ] Không có tiếng Việt trong backend source (chỉ ticket prose).
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Entity (mirror `cash-vouchers` document entity + soft-delete):

```ts
export enum DepositTransferStatus {
  DANG_CHUYEN = 'DANG_CHUYEN', // leg A posted, B chưa xác nhận → tiền ở TK 113
  HOAN_TAT = 'HOAN_TAT',       // B đã xác nhận → tiền vào B, 113 clear
  DA_HUY = 'DA_HUY',           // hủy khi còn DANG_CHUYEN → reverse chân A
}

@Entity('deposit_transfer')
@Index(['organizationId', 'status'])
export class DepositTransferEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') organizationId: string;
  @Column('uuid') fromBranchId: string;
  @Column('uuid') toBranchId: string;
  @Column('uuid') fromAccountId: string;   // deposit_accounts.id @ A
  @Column('uuid') toAccountId: string;      // deposit_accounts.id @ B
  @Column({ type: 'numeric', precision: 18, scale: 2 }) amount: string;
  @Column({ type: 'enum', enum: DepositTransferStatus, default: DepositTransferStatus.DANG_CHUYEN })
  status: DepositTransferStatus;
  @Column('uuid') fromPaymentId: string;    // bank_payments.id (leg A)
  @Column({ type: 'uuid', nullable: true }) toReceiptId: string | null; // bank_receipts.id (leg B)
  @Column('uuid') transferPairId: string;   // = id; ghi vào deposit_movements.transfer_pair_id cả 2 chân
  @Column('uuid') initiatedBy: string;
  @Column({ type: 'timestamptz' }) initiatedAt: Date;
  @Column({ type: 'uuid', nullable: true }) confirmedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) confirmedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) cancelledBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'text', nullable: true }) cancelReason: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deletedAt: Date | null;
}
```

Migration (hand-written; trích DDL, không dùng `migration:generate` — tránh drift, per convention). Timestamp = `Date.now()` lúc viết:

```ts
export class DepositTransfer<timestamp> implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "deposit_transfer_status" AS ENUM ('DANG_CHUYEN','HOAN_TAT','DA_HUY')`);
    await q.query(`
      CREATE TABLE "deposit_transfer" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "organization_id" uuid NOT NULL,
        "from_branch_id" uuid NOT NULL,
        "to_branch_id" uuid NOT NULL,
        "from_account_id" uuid NOT NULL,
        "to_account_id" uuid NOT NULL,
        "amount" numeric(18,2) NOT NULL CHECK ("amount" > 0),
        "status" "deposit_transfer_status" NOT NULL DEFAULT 'DANG_CHUYEN',
        "from_payment_id" uuid NOT NULL,
        "to_receipt_id" uuid,
        "transfer_pair_id" uuid NOT NULL,
        "initiated_by" uuid NOT NULL,
        "initiated_at" timestamptz NOT NULL,
        "confirmed_by" uuid, "confirmed_at" timestamptz,
        "cancelled_by" uuid, "cancelled_at" timestamptz, "cancel_reason" text,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )`);
    await q.query(`CREATE INDEX "idx_deposit_transfer_org_status" ON "deposit_transfer" ("organization_id","status")`);
    await q.query(`CREATE INDEX "idx_deposit_transfer_from_branch" ON "deposit_transfer" ("from_branch_id")`);
    await q.query(`CREATE INDEX "idx_deposit_transfer_to_branch"   ON "deposit_transfer" ("to_branch_id")`);
    await q.query(`CREATE INDEX "idx_deposit_transfer_from_acct"   ON "deposit_transfer" ("from_account_id")`);
    await q.query(`CREATE INDEX "idx_deposit_transfer_to_acct"     ON "deposit_transfer" ("to_account_id")`);
    // NB: deposit_movements.transfer_pair_id / transfer_status đã có từ GĐ1 (TKT-DF-01) — KHÔNG ALTER lại.
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "deposit_transfer"`);
    await q.query(`DROP TYPE "deposit_transfer_status"`);
  }
}
```

COA / contra (reuse): trong `coa-seeder.service.ts` thêm (nếu thiếu) account `113` "Tiền đang chuyển" (asset). Trong `account-resolver.service.ts` bổ sung map role/purpose → `resolveContraAccount('INTER_BRANCH_OUT') = 113`, `resolveContraAccount('INTER_BRANCH_IN') = 113`. Cả 2 chân đều lấy 113 làm phía đối ứng, nên khi A chi thì 113 tăng, khi B thu thì 113 giảm → net 0 khi hoàn tất (bảo toàn tổng quỹ).

**Vì sao dùng WITHDRAWAL/DEPOSIT (không phải type TRANSFER 1 dòng):** convention TRANSFER của cash lưu 1 movement với `cashAccountId`=nguồn + `toAccountId`=đích, dùng cho chuyển **tức thời cùng lúc**. FR-07 là 2 chân **lệch thời gian, 2 chi nhánh**, nên mỗi chân là 1 movement độc lập (chân A = WITHDRAWAL trên tài khoản A, chân B = DEPOSIT trên tài khoản B), nối nhau qua `transfer_pair_id` + đối ứng qua 113. Điều này cũng cho phép tái dùng thẳng máy chứng từ `bank_payments`/`bank_receipts` (vốn ghi WITHDRAWAL/DEPOSIT).

## Testing Strategy

- Unit (`deposit-transfer.entity.spec.ts` hoặc migration smoke): assert entity metadata (bảng `deposit_transfer`, enum 3 giá trị, `amount` numeric 18/2, soft-delete column).
- Migration verify: `pnpm migration:run` → `pnpm migration:show` liệt kê migration mới; `pnpm migration:revert` drop sạch. (Không cần E2E riêng ở ticket này — E2E flow ở TKT-DFB-06.)

## Dependencies

- Depends on: EPIC GĐ1 (`deposit_movements` với `transfer_pair_id`/`transfer_status`, `deposit_accounts`), EPIC GĐ2 (`bank_payments`/`bank_receipts`, purpose `INTER_BRANCH_*`).
- Blocks: TKT-DFB-02.
