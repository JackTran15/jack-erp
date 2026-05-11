# TKT-057 Cash movement session link

## Epic

[EPIC-009 Cash Management Enhancement](../epics/EPIC-009-cash-management-enhancement.md)

## Summary

Thêm field `session_id` (nullable) vào `cash_movements` để mỗi movement biết thuộc ca làm việc nào. Hiện tại `SessionReconciliation.expectedCash` tính từ `createdAt` range — rủi ro: 2 ca chồng thời gian (mở/đóng overlap) hoặc movement tạo ngoài giờ session sẽ tính sai. Sau ticket này: `recordMovement` auto-fill `sessionId` từ ActorContext (nếu actor đang có session OPEN trên `cashAccountId`); reconciliation filter theo `sessionId`.

## Deliverables

- Migration: `1779530000000-AddSessionIdToCashMovement.ts` — column `session_id` (uuid, nullable, FK → pos_sessions).
- Update entity: `apps/api/src/modules/accounting/cash/cash-movement.entity.ts` — thêm `sessionId` + relation.
- Update `CashService.recordMovement()` — auto-derive `sessionId`:
  - Tìm session OPEN/ACTIVE_SALES trên `cashAccountId` của actor → set `sessionId`.
  - Không có session active → `sessionId = null` (admin movement, không thuộc ca cụ thể).
- Update `SessionReconciliationService.computeExpectedCash()` — filter movements bằng `sessionId` thay vì `createdAt` range.

## Acceptance Criteria

- [ ] Migration up/down idempotent; FK trỏ về `pos_sessions(id)`.
- [ ] `recordMovement` trong context có session active → `sessionId` được set.
- [ ] `recordMovement` không có session active (ví dụ admin transfer giữa các két SAFE) → `sessionId = null`.
- [ ] `computeExpectedCash(sessionId)` chỉ cộng/trừ movements có `session_id = X`.
- [ ] `expectedCash` = `openingCashAmount + sum(DEPOSIT) - sum(WITHDRAWAL) + sum(TRANSFER_IN) - sum(TRANSFER_OUT)` cho session đó.
- [ ] TRANSFER_IN: movement có `toAccountId = cashAccountId` của session.
- [ ] TRANSFER_OUT: movement có `cashAccountId` của session.

## Definition of Done

- [ ] PR có migration + entity + service updates + tests; pass CI.
- [ ] Unit test: auto-fill sessionId từ context; reconciliation tính đúng với mỗi loại movement.
- [ ] Integration test: open session → record 5 movements (mix types) → close → verify expected_cash chính xác.

## Tech Approach

### Entity

```typescript
@Column({ name: 'session_id', type: 'uuid', nullable: true, comment: 'POS session that recorded this movement, if any' })
sessionId?: string;

@ManyToOne(() => PosSessionEntity, { nullable: true })
@JoinColumn({ name: 'session_id' })
session?: PosSessionEntity;
```

### Auto-derive sessionId

```typescript
// In CashService.recordMovement(), before insert:
const activeSession = await this.sessionRepo.findOne({
  where: {
    cashAccountId: dto.cashAccountId,
    status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
    organizationId: actor.organizationId,
  },
});
const sessionId = activeSession?.id ?? null;

// movement creation:
const movement = manager.create(CashMovementEntity, {
  ...dto,
  sessionId,
  // ...
});
```

### Reconciliation

```typescript
async computeExpectedCash(sessionId: string): Promise<number> {
  const session = await this.sessionRepo.findOneOrFail({ where: { id: sessionId } });
  const opening = Number(session.openingCashAmount);

  // Movements WHERE cash_account_id = session.cashAccountId AND session_id = sessionId
  const movements = await this.movementRepo
    .createQueryBuilder('m')
    .where('m.session_id = :sid', { sid: sessionId })
    .getMany();

  let delta = 0;
  for (const m of movements) {
    const amt = Number(m.amount);
    if (m.type === CashMovementType.DEPOSIT || m.type === CashMovementType.ADJUSTMENT) {
      delta += amt;
    } else if (m.type === CashMovementType.WITHDRAWAL) {
      delta -= amt;
    } else if (m.type === CashMovementType.TRANSFER) {
      // Movement.cashAccountId = source; if it matches session.cashAccountId → outflow
      if (m.cashAccountId === session.cashAccountId) delta -= amt;
      // TRANSFER_IN comes as a separate movement with cashAccountId = destination (via TKT-054 logic)
    }
  }

  // Also include incoming transfers (toAccountId = session.cashAccountId, but session_id might differ)
  // Better: scan transfers where toAccountId = session.cashAccountId AND created during session
  // (or store a TRANSFER_IN movement explicitly — design decision)

  return opening + delta;
}
```

**Design note**: TRANSFER hiện tạo 1 movement với `cashAccountId=source, toAccountId=dest`. Để reconciliation đơn giản và đúng, có thể tạo **2 movements** cho mỗi TRANSFER (1 OUT cho source, 1 IN cho dest) với `sessionId` riêng cho từng két nếu cùng lúc 2 két đều có session active. → **Quyết định trong implementation**.

## Testing Strategy

- Unit: auto-fill (with/without active session); reconcile with mixed movement types.
- Integration: open session → DEPOSIT 500 + WITHDRAWAL 100 + TRANSFER_OUT 200 → close → expectedCash = opening + 200.

## Dependencies

- Requires: TKT-056 (cash_account_id trong pos_sessions).
- Required by: TKT-058.
