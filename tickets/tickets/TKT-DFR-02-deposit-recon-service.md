# TKT-DFR-02 Deposit reconciliation service + controller (FR-09)

## Epic

[EPIC-15072026 Deposit Fund — Reconcile & Lock](../epics/EPIC-15072026-deposit-fund-reconcile-lock.md)

## Summary

`DepositReconService` + `DepositReconController` hiện thực màn **Đối chiếu tiền gửi** (FR-09): liệt kê bút toán thu tiền gửi để đối chiếu (lọc theo `Số tài khoản` — cột đang trống trong ref.md §13), chọn nhiều dòng → nhập tổng sao kê → hệ thống hiện chênh lệch (`system_total` = Σ `net_amount`), khớp → `recon_status = DA`, lệch → `LECH` (bắt buộc ghi chú — BR-REC-02). Đối chiếu tạo `deposit_recon_batch` + số `DS`. **Hủy đối chiếu** chỉ Kế toán trưởng, bắt buộc lý do, ghi `deposit_audit_log` (BR-PERM-03). Giao dịch đã đối chiếu **bị khóa** — chặn sửa/hủy hóa đơn gốc (BR-REC-01), expose guard `assertNotReconciled()` cho DFR-05 và module spending dùng lại. Quyền `accounting.deposit_recon.reconcile` **tách rời** quyền tạo phiếu chi (segregation of duties — BR-PERM-02).

## Deliverables

- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.service.ts` — logic đối chiếu/hủy đối chiếu + query grid + Excel export + guard `assertNotReconciled(movementId, manager?)`.
- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.controller.ts` — `@UseGuards(PermissionGuard, BranchScopeGuard)`, `@RequireBranchScope()`, `@Actor()`, `@UseInterceptors(AuditInterceptor)`.
- `apps/api/src/modules/accounting/deposit-recon/deposit-recon-batch.entity.ts` — map `deposit_recon_batch` (DFR-01).
- `apps/api/src/modules/accounting/deposit-recon/dto/` — `list-recon.dto.ts` (filters), `reconcile.dto.ts`, `unreconcile.dto.ts` — class-validator + `@ApiProperty`, khai báo mọi field (`whitelist: true`).
- `apps/api/src/modules/accounting/deposit-recon/deposit-recon.module.ts` — module wiring; import trong `AccountingModule`.
- Permission seed (bổ sung vào seed accounting hiện có): `accounting.deposit_recon.read`, `accounting.deposit_recon.reconcile`, `accounting.deposit_recon.unreconcile`, `accounting.deposit_recon.export`.

### Endpoints

- `GET /deposit-recon` — grid đối chiếu. Query: `branchId`, `depositAccountId` (**Số tài khoản**), `reconStatus` (default `CHUA`), `dateFrom`/`dateTo` (theo `value_date` — R2, DFR-04), `docNumber`, `transactionType`, `cardType`, `amount`. Trả rows với cột bổ sung FR-09: `valueDate` (Ngày ghi có), `netAmount` (Số tiền thực nhận), `feeAmount` (Phí), `bankRefCode` (Mã tham chiếu NH), `reconciledBy`/`reconciledAt`, `discrepancyNote` (Ghi chú lệch); + dòng tổng `rowCount`, `totalAmount` (giữ nguyên màn hiện có); + cờ cảnh báo `hasStaleUnreconciled` (có `CHUA` quá N ngày — BR-REC-04).
- `POST /deposit-recon/reconcile` — body `{ depositAccountId, movementIds[], stmtTotalAmount, stmtFromDate, stmtToDate, note? }`. Trả `{ batch, systemTotalAmount, diffAmount, status }`.
- `POST /deposit-recon/unreconcile` — body `{ movementIds[]?, batchId?, reason }`. **`accounting.deposit_recon.unreconcile`** (Kế toán trưởng).
- `GET /deposit-recon/export` — Excel (cùng filter với list) — NFR-02: ≥100k dòng chạy background (Phase sau); GĐ3 export đồng bộ với cảnh báo giới hạn dòng.

## Acceptance Criteria

- [ ] Mọi query lọc `actor.organizationId` + `actor.branchId` (BranchScope); Kế toán CN không thấy giao dịch chi nhánh khác (BR-PERM-01, UAT-13).
- [ ] `GET /deposit-recon` mặc định `reconStatus=CHUA`; filter `Số tài khoản` (`depositAccountId`) hoạt động — vá gap cột trống ref.md §13.
- [ ] Reconcile: `systemTotalAmount = Σ net_amount` của các `movementIds` (dùng `net_amount`, KHÔNG `amount` — khớp sao kê sau phí, R1); `diffAmount = stmtTotalAmount − systemTotalAmount`.
- [ ] `diffAmount == 0` → set các movement `recon_status='DA'`, gắn `recon_batch_id`/`reconciled_by`/`reconciled_at`; batch `status=RECONCILED` (BR-REC-02).
- [ ] `diffAmount != 0` → **bắt buộc `note`** (thiếu → 400); set `recon_status='LECH'`; batch `status=DISCREPANCY`; **KHÔNG tự ghi giảm quỹ** — tạo đề xuất bút toán điều chỉnh qua `DepositFeeService.proposeFeeAdjustment()` (DFR-03, BR-REC-03).
- [ ] Chỉ đối chiếu movement đang `CHUA` — `SELECT ... FOR UPDATE`; re-check status trong tx để chặn double-reconcile.
- [ ] `assertNotReconciled(movementId)`: nếu `recon_status IN ('DA','LECH')` → throw (block edit/cancel source — BR-REC-01); DFR-05 và spending module gọi guard này trước khi hủy/sửa.
- [ ] Unreconcile: chỉ `accounting.deposit_recon.unreconcile`; bắt buộc `reason`; reset `recon_status='CHUA'` + clear `recon_batch_id`/`reconciled_*`; ghi `deposit_audit_log(action='UNRECONCILE', before, after, reason)` (BR-PERM-03, NFR-05).
- [ ] Quyền `reconcile` khác quyền tạo phiếu chi (`accounting.bank_payment.create`) — segregation of duties (BR-PERM-02).
- [ ] Số DS sinh qua `DocumentNumberingService.generate(DocumentType.RECONCILIATION, actor.branchId, actor)` tại thời điểm reconcile.
- [ ] Reconcile/unreconcile idempotent qua global `IdempotencyInterceptor` (`X-Idempotency-Key`).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: reconcile khớp (diff=0), reconcile lệch bắt buộc note, double-reconcile bị chặn, unreconcile perm + reason, guard `assertNotReconciled`, cross-branch không leak.
- [ ] Không đổi `synchronize`; không schema change ngoài DFR-01.
- [ ] Endpoint đổi → openapi regen ở DFR-07.
- [ ] Không tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

Aggregate trong RAM (memory rule): fetch raw movements rồi Σ `net_amount` bằng JS, không GROUP BY. Cột bổ sung join inline per-row.

```ts
@Injectable()
export class DepositReconService {
  constructor(
    @InjectRepository(DepositMovementEntity) private readonly movements: Repository<DepositMovementEntity>,
    @InjectRepository(DepositReconBatchEntity) private readonly batches: Repository<DepositReconBatchEntity>,
    private readonly dataSource: DataSource,
    private readonly docNumbering: DocumentNumberingService, // DocumentType.RECONCILIATION → DS
    private readonly feeService: DepositFeeService,           // DFR-03 — proposeFeeAdjustment (BR-REC-03)
    private readonly audit: DepositAuditService,              // DFR-06 (parallel: fallback insert vào deposit_audit_log repo)
    @Inject(RECON_CONFIG) private readonly cfg: { staleUnreconciledDays: number }, // BR-REC-04
  ) {}

  async reconcile(dto: ReconcileDto, actor: ActorContext) {
    return this.dataSource.transaction(async (m) => {
      const rows = await m.getRepository(DepositMovementEntity).find({
        where: { id: In(dto.movementIds), organizationId: actor.organizationId, branchId: actor.branchId,
                 depositAccountId: dto.depositAccountId, reconStatus: ReconStatus.CHUA },
        lock: { mode: 'pessimistic_write' },
      });
      if (rows.length !== dto.movementIds.length) throw new BadRequestException('Some movements already reconciled or out of scope');

      const systemTotal = sumNet(rows);                    // Σ net_amount in JS
      const diff = round2(dto.stmtTotalAmount - systemTotal);
      const status = diff === 0 ? ReconBatchStatus.RECONCILED : ReconBatchStatus.DISCREPANCY;
      if (status === ReconBatchStatus.DISCREPANCY && !dto.note) throw new BadRequestException('note required for discrepancy'); // BR-REC-02

      const batchNumber = await this.docNumbering.generate(DocumentType.RECONCILIATION, actor.branchId!, actor);
      const batch = await m.getRepository(DepositReconBatchEntity).save({ /* ...dto, systemTotal, diff, status, batchNumber, reconciledBy: actor.userId */ });

      const nextStatus = diff === 0 ? ReconStatus.DA : ReconStatus.LECH;
      await m.getRepository(DepositMovementEntity).update({ id: In(dto.movementIds) },
        { reconStatus: nextStatus, reconBatchId: batch.id, reconciledBy: actor.userId, reconciledAt: new Date() });

      if (diff !== 0) await this.feeService.proposeFeeAdjustment({ batch, diff }, actor, m); // BR-REC-03 — DRAFT, KHÔNG ghi quỹ
      await this.audit.record({ entityType: 'RECON_BATCH', entityId: batch.id, action: 'RECONCILE', after: batch }, actor, m);
      return { batch, systemTotalAmount: systemTotal, diffAmount: diff, status };
    });
  }

  /** BR-REC-01: reused by DFR-05 (cancel) + spending edit path. */
  async assertNotReconciled(movementId: string, manager?: EntityManager) {
    const repo = (manager ?? this.dataSource.manager).getRepository(DepositMovementEntity);
    const mv = await repo.findOneByOrFail({ id: movementId });
    if (mv.reconStatus !== ReconStatus.CHUA)
      throw new ConflictException('Movement is reconciled and locked; unreconcile first (BR-REC-01)');
  }

  async unreconcile(dto: UnreconcileDto, actor: ActorContext) { /* perm-guarded at controller; reason required; audit UNRECONCILE */ }
}
```

Controller:

```ts
@Controller('deposit-recon')
@UseGuards(PermissionGuard, BranchScopeGuard)
@UseInterceptors(AuditInterceptor)
export class DepositReconController {
  @Get() @RequirePermission('accounting.deposit_recon.read') @RequireBranchScope()
  list(@Query() q: ListReconDto, @Actor() a: ActorContext) { /* ... */ }

  @Post('reconcile') @RequirePermission('accounting.deposit_recon.reconcile') @RequireBranchScope()
  reconcile(@Body() dto: ReconcileDto, @Actor() a: ActorContext) { /* ... */ }

  @Post('unreconcile') @RequirePermission('accounting.deposit_recon.unreconcile') @RequireBranchScope()
  unreconcile(@Body() dto: UnreconcileDto, @Actor() a: ActorContext) { /* Kế toán trưởng only — BR-PERM-03 */ }

  @Get('export') @RequirePermission('accounting.deposit_recon.export') @RequireBranchScope()
  export(@Query() q: ListReconDto, @Actor() a: ActorContext) { /* Excel */ }
}
```

Reuse: `DocumentNumberingService` (DS), `ActorContext`/guards/`AuditInterceptor` như module accounting hiện có; grid/query pattern theo `cash-ledger.service.ts` (SQL SUM + JS). Excel export theo pattern export sẵn có trong repo (`inventory/csv` `CsvExportService` là mẫu tham chiếu — không import trực tiếp).

**Audit-service coupling (parallel note):** `DepositAuditService` do DFR-06 owner. Vì DFR-02..06 chạy song song, DFR-02 ghi audit **trực tiếp qua repo `deposit_audit_log`** (helper cục bộ), DFR-06 sẽ hợp nhất về `DepositAuditService` khi wire NFR-05 toàn module.

## Testing Strategy

- Unit (`deposit-recon.service.spec.ts`): mock repos + dataSource.transaction. Cases: (1) diff=0 → DA + batch RECONCILED; (2) diff≠0 + có note → LECH + batch DISCREPANCY + gọi `proposeFeeAdjustment`, **không** update balance; (3) diff≠0 thiếu note → 400; (4) movement không còn CHUA → 400 (double-reconcile); (5) `assertNotReconciled` throw khi DA/LECH; (6) unreconcile reset về CHUA + audit; (7) systemTotal dùng `net_amount` không `amount`.
- E2E: gộp vào DFR-09 (UAT-09 end-to-end với fee).

## Dependencies

- Depends on: TKT-DFR-01 (schema); `DepositFeeService.proposeFeeAdjustment` (TKT-DFR-03) — nếu DFR-03 chưa land, stub interface rồi wire sau.
- Blocks: TKT-DFR-07 (openapi), TKT-DFR-05 (dùng `assertNotReconciled`), TKT-DFR-08 (FE), TKT-DFR-09 (E2E).
