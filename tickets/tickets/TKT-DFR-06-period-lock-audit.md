# TKT-DFR-06 Period lock + module-wide audit log (FR-12, NFR-05)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

`DepositPeriodLockService` + `DepositPeriodLockController` khóa/mở sổ theo kỳ (`YYYY-MM` per chi nhánh). Khóa kỳ chốt **snapshot số dư cuối kỳ của từng tài khoản** vào `deposit_period_lock.closing_balance_snapshot` (BR-LOCK-03 — làm số dư đầu kỳ kế tiếp). `DepositPeriodGuardService.assertNotLocked(branchId, docDate)` chặn **mọi mutation** có `doc_date` thuộc kỳ đã khóa (BR-LOCK-01, UAT-11). Giao dịch POS đồng bộ **trễ** rơi vào kỳ khóa → đưa vào hàng đợi `Chờ xử lý` (DLQ) + alert Kế toán trưởng (BR-LOCK-02, BR-POS-04), không mất giao dịch. Ticket này cũng **owner của `DepositAuditService`** (NFR-05) và **wire audit trên mọi mutation của module** (đối chiếu, hủy đối chiếu, đảo bút toán, khóa/mở kỳ, sửa số dư đầu kỳ). Khóa/mở kỳ chỉ **Kế toán trưởng**.

## Deliverables

- `apps/api/src/modules/accounting/deposit-period-lock/deposit-period-lock.service.ts` — `lock()`, `unlock()`, snapshot closing balance per account.
- `apps/api/src/modules/accounting/deposit-period-lock/deposit-period-guard.service.ts` — `assertNotLocked(branchId, docDate, manager?)`; export cho DFR-05 + spending/movement paths.
- `apps/api/src/modules/accounting/deposit-period-lock/deposit-period-lock.controller.ts` — guards + `@Actor()` + `AuditInterceptor`.
- `apps/api/src/modules/accounting/deposit-period-lock/deposit-period-lock.entity.ts` — map `deposit_period_lock` (DFR-01).
- `apps/api/src/modules/accounting/deposit-audit/deposit-audit.service.ts` — `record({entityType, entityId, action, before?, after?, reason?}, actor, manager?)`; **owner NFR-05**, hợp nhất các chỗ DFR-02/05 ghi trực tiếp; `GET /deposit-audit-log` read endpoint.
- `apps/api/src/modules/accounting/deposit-period-lock/deposit-locked-pos.consumer-hook.ts` — nhánh xử lý auto-post POS trễ rơi vào kỳ khóa: route DLQ + emit `deposit.locked_period.blocked` (alert Kế toán trưởng).
- Permission seed: `accounting.deposit_period.read`, `accounting.deposit_period.lock`, `accounting.deposit_period.unlock` (lock/unlock = Kế toán trưởng), `accounting.deposit_audit.read`.

### Endpoints

- `POST /deposit-period-locks` — `{ branchId, period }`. Snapshot + tạo lock. `accounting.deposit_period.lock`.
- `POST /deposit-period-locks/:id/unlock` — `{ reason }`. `accounting.deposit_period.unlock`.
- `GET /deposit-period-locks` — list per branch.
- `GET /deposit-audit-log` — `{ entityType?, entityId?, action?, dateFrom?, dateTo? }`. `accounting.deposit_audit.read`.

## Acceptance Criteria

- [ ] `lock()`: cho từng `deposit_account` của chi nhánh, tính `closingBalance`/`bookBalance`/`availableBalance` tới hết kỳ (Σ signed `doc_date <= period-end`) → lưu `closing_balance_snapshot jsonb` (BR-LOCK-03); tạo lock `status=LOCKED`; ghi audit `LOCK_PERIOD`.
- [ ] Snapshot cuối kỳ N = số dư đầu kỳ N+1 (verify khớp opening kỳ kế tiếp).
- [ ] `assertNotLocked(branchId, docDate)`: nếu tồn tại lock `status=LOCKED` với `period = toYearMonth(docDate)` → **409 BLOCKED** (BR-LOCK-01). Gọi từ: tạo/đảo movement, post `bank_receipt`/`bank_payment`, DFR-05 reversal.
- [ ] `unlock()`: chỉ `accounting.deposit_period.unlock`; bắt buộc `reason`; set `status=UNLOCKED` + `unlocked_by/at/reason`; ghi audit `UNLOCK_PERIOD` (BR-PERM-03).
- [ ] BR-REC-04: `lock()` cảnh báo/chặn nếu còn giao dịch `recon_status='CHUA'` quá N ngày (config) trong kỳ — trả danh sách vi phạm; chặn nếu cấu hình `blockOnStaleUnreconciled=true`.
- [ ] POS trễ rơi kỳ khóa (BR-LOCK-02, BR-POS-04): consumer **không mất** giao dịch — route DLQ `Chờ xử lý` + emit `deposit.locked_period.blocked` (alert Kế toán trưởng) + audit `POS_LATE_LOCKED`. Kế toán trưởng mở kỳ tạm hoặc hạch toán kỳ mới (replay DLQ).
- [ ] `DepositAuditService.record` bất biến (INSERT-only), before/after `jsonb`; wire trên đối chiếu/hủy đối chiếu/đảo/khóa-mở/sửa số dư đầu kỳ (NFR-05 coverage đầy đủ).
- [ ] Lock unique `(organizationId, branchId, period)` — khóa lại kỳ đã khóa → 409; mở kỳ chưa khóa → 400.
- [ ] Mọi query lọc `organizationId` (+`branchId`); Kế toán CN không khóa/xem kỳ chi nhánh khác (BR-PERM-01, UAT-13).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: lock snapshot đúng, assertNotLocked chặn doc_date trong kỳ, unlock perm+reason, POS trễ → DLQ + alert, audit coverage, stale-unreconciled cảnh báo.
- [ ] Không đổi `synchronize`; không schema change ngoài DFR-01.
- [ ] Endpoint đổi → openapi regen ở DFR-07.
- [ ] Không tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@Injectable()
export class DepositPeriodLockService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balances: DepositBalanceService, // DFR-04 — book/available per account
    private readonly audit: DepositAuditService,
    @Inject(LOCK_CONFIG) private readonly cfg: { staleUnreconciledDays: number; blockOnStaleUnreconciled: boolean },
  ) {}

  async lock(dto: LockPeriodDto, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      await this.assertNoStaleUnreconciled(dto.branchId, dto.period, actor, m); // BR-REC-04
      const accounts = await m.getRepository(DepositAccountEntity).find({ where: { branchId: dto.branchId, organizationId: actor.organizationId } });
      const snapshot = [];
      for (const acc of accounts) {
        const b = await this.balances.getBalances(acc.id, actor); // to end-of-period
        snapshot.push({ depositAccountId: acc.id, closingBalance: b.bookBalance, bookBalance: b.bookBalance, availableBalance: b.availableBalance });
      }
      const lock = await m.getRepository(DepositPeriodLockEntity).save({
        organizationId: actor.organizationId, branchId: dto.branchId, period: dto.period,
        status: PeriodLockStatus.LOCKED, closingBalanceSnapshot: snapshot, lockedBy: actor.userId, lockedAt: new Date(),
      }); // unique (org, branch, period) → 409 on re-lock
      await this.audit.record({ entityType: 'PERIOD_LOCK', entityId: lock.id, action: 'LOCK_PERIOD', after: lock }, actor, m);
      return lock;
    });
  }
}

@Injectable()
export class DepositPeriodGuardService {
  async assertNotLocked(branchId: string, docDate: Date | string, m?: EntityManager) {
    const period = toYearMonth(docDate); // 'YYYY-MM'
    const locked = await (m ?? this.dataSource.manager).getRepository(DepositPeriodLockEntity)
      .findOneBy({ branchId, period, status: PeriodLockStatus.LOCKED });
    if (locked) throw new ConflictException(`Period ${period} is locked (BR-LOCK-01)`);
  }
}
```

POS-late-locked hook (trong nhánh non-cash của auto-post consumer, GĐ1):

```ts
try { await this.periodGuard.assertNotLocked(branchId, docDate, m); }
catch (e) {
  if (e instanceof ConflictException) {
    await this.dlq.enqueue('deposit.locked_period.pending', evt, { reason: 'LOCKED_PERIOD' }); // Chờ xử lý
    await this.events.publish('deposit.locked_period.blocked', { branchId, invoiceId, period }); // alert KTT
    await this.audit.record({ entityType: 'DEPOSIT_MOVEMENT', entityId: evt.invoiceId, action: 'POS_LATE_LOCKED' }, evt.actor, m);
    return; // do NOT lose the txn
  }
  throw e;
}
```

Reuse: `DepositBalanceService` (DFR-04) cho snapshot; DLQ `modules/events/` (dead-letter → hàng đợi Chờ xử lý); `EventPublisher` (alert); guards/`AuditInterceptor` accounting hiện có.

**Audit ownership (parallel note):** DFR-02/DFR-05 ghi `deposit_audit_log` trực tiếp qua repo khi land trước; DFR-06 introduce `DepositAuditService` và refactor các call-site về service + đảm bảo coverage NFR-05 đầy đủ (đối chiếu/hủy/đảo/khóa/mở/sửa opening).

## Testing Strategy

- Unit (`deposit-period-lock.service.spec.ts`): lock snapshot per account đúng (= book/available cuối kỳ); re-lock → 409; unlock perm+reason+audit; assertNotLocked chặn doc_date trong kỳ, cho qua ngoài kỳ/kỳ UNLOCKED; stale-unreconciled cảnh báo/chặn; POS-late → DLQ + emit + không tạo movement; snapshot cuối kỳ = opening kỳ kế.
- E2E: DFR-09 UAT-11 (khóa tháng 06 → tạo phiếu chi 15/06 bị chặn).

## Dependencies

- Depends on: TKT-DFR-01 (schema), TKT-DFR-04 (`DepositBalanceService` cho snapshot); GĐ1 (auto-post consumer hook cho POS-late).
- Blocks: TKT-DFR-05 (`assertNotLocked`), TKT-DFR-07 (openapi), TKT-DFR-08 (FE khóa sổ), TKT-DFR-09 (E2E).
