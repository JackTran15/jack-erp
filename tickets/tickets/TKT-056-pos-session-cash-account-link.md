# TKT-056 POS session — cash account link

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Link `cash_account_id` vào `pos_sessions` để biết mỗi ca làm việc đang dùng két nào. Hiện tại `pos_sessions` chỉ có `terminalId` (optional) — không liên kết đến két vật lý → không thể tính `expectedCash` chính xác khi chốt ca. Sau ticket này: khi mở ca, thu ngân phải chọn 1 `cash_account` type=REGISTER thuộc branch; không được mở 2 session đồng thời trên cùng 1 két.

## Deliverables

- Migration: `1779520000000-AddCashAccountToPosSession.ts` — column `cash_account_id` (uuid, FK → cash_accounts).
- Update entity: `apps/api/src/modules/pos/entities/pos-session.entity.ts` — thêm `cashAccountId`.
- Update DTO open session: thêm `cashAccountId` required.
- Update service `PosSessionService.open()`:
  - Validate `cashAccount.type === REGISTER`.
  - Validate `cashAccount.branchId === actor.branchId`.
  - Validate không có session khác trên cùng `cashAccountId` với status `OPEN | ACTIVE_SALES`.
- Update `pos_sessions` index: `(cashAccountId, status) WHERE status IN ('OPEN', 'ACTIVE_SALES')` partial unique.

## Acceptance Criteria

- [ ] Migration up: thêm column nullable trước, backfill bằng cash_account đầu tiên của branch (REGISTER type), set NOT NULL.
  - Hoặc: nullable cho rows cũ, NOT NULL từ rows mới (chấp nhận data lịch sử không có link).
- [ ] Open session thiếu `cashAccountId` → 400.
- [ ] Open session với `cashAccount.type !== REGISTER` → 400 (chỉ REGISTER mới gắn được session).
- [ ] Open session với `cash_account` đã có session khác đang OPEN/ACTIVE_SALES → 409 Conflict.
- [ ] Partial unique index ngăn race condition (2 request đồng thời mở session trên cùng két).

## Definition of Done

- [ ] PR có migration + entity + DTO + service + tests; pass CI.
- [ ] Unit test: open success, open với type=SAFE → 400, open với cash_account đã in-use → 409.
- [ ] Integration test: 2 concurrent open requests → 1 success, 1 conflict.
- [ ] Migration test: data lịch sử nullable; rows mới NOT NULL.

## Tech Approach

### Migration strategy

```typescript
public async up(qr: QueryRunner): Promise<void> {
  // Step 1: add nullable
  await qr.query(`ALTER TABLE pos_sessions ADD COLUMN cash_account_id uuid`);
  await qr.query(`
    ALTER TABLE pos_sessions
    ADD CONSTRAINT fk_pos_sessions_cash_account
    FOREIGN KEY (cash_account_id) REFERENCES cash_accounts(id)
  `);

  // Step 2: backfill (optional — pick first REGISTER per branch)
  await qr.query(`
    UPDATE pos_sessions ps
    SET cash_account_id = (
      SELECT id FROM cash_accounts ca
      WHERE ca.branch_id = ps.branch_id AND ca.type = 'REGISTER'
      ORDER BY ca.created_at ASC LIMIT 1
    )
    WHERE cash_account_id IS NULL
  `);

  // Step 3: partial unique index
  await qr.query(`
    CREATE UNIQUE INDEX idx_pos_session_active_per_cash_account
    ON pos_sessions (cash_account_id)
    WHERE status IN ('OPEN', 'ACTIVE_SALES')
  `);
}
```

### Entity

```typescript
@Column({ name: 'cash_account_id', type: 'uuid', nullable: true, comment: 'Cash register/drawer used in this session' })
cashAccountId?: string;
```

### Service guard

```typescript
async open(dto: OpenSessionDto, actor: ActorContext) {
  const cashAccount = await this.cashAccountRepo.findOneOrFail({
    where: { id: dto.cashAccountId, organizationId: actor.organizationId },
  });

  if (cashAccount.type !== CashAccountType.REGISTER) {
    throw new BadRequestException('Only REGISTER cash accounts can be linked to POS sessions');
  }
  if (cashAccount.branchId !== actor.branchId) {
    throw new BadRequestException('Cash account branch mismatch');
  }

  const activeSession = await this.sessionRepo.findOne({
    where: {
      cashAccountId: dto.cashAccountId,
      status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
    },
  });
  if (activeSession) {
    throw new ConflictException(`Cash account ${cashAccount.name} already in use by another session`);
  }

  // ... existing create logic
}
```

## Testing Strategy

- Unit: validation guards.
- Integration: 2 concurrent opens via `Promise.all` → assert one rejects with 409.
- DB: insert duplicate active row directly → unique index throws.

## Dependencies

- Requires: TKT-053 (CashAccountType — cần REGISTER).
- Required by: TKT-057 (auto-fill session_id), TKT-058 (lấy cash_account của session để tạo movement).
