# TKT-DFB-03 Báo cáo tiền đang chuyển + Dashboard số dư toàn hệ thống

## Epic

[EPIC-15072026 Quỹ Tiền Gửi — Chuyển tiền liên chi nhánh (GĐ4)](../epics/EPIC-15072026-deposit-fund-inter-branch.md)

## Summary

Hai màn hình đọc để sổ tổng đối chiếu được và tiền không "bốc hơi" (BR-TRF-02, R5):

1. **Báo cáo tiền đang chuyển** — liệt kê mọi `deposit_transfer` còn `DANG_CHUYEN` (kèm CN nguồn/đích, tài khoản, số tiền, người/khi khởi tạo, số ngày đang treo). Tổng của báo cáo = số dư TK 113 = phần "tiền đang chuyển" cần cộng vào tổng quỹ để bảo toàn. Đánh dấu `isOverdue` cho khoản treo quá `staleDays` (BR-TRF-04).
2. **Dashboard số dư toàn hệ thống** — số dư per-branch + per-account (cross-branch), cộng khoản in-transit, cho ra **grand total = Σ(deposit_accounts.balance) + Σ(in-transit)** — bất biến trước/giữa/sau chuyển tiền. Vẫn **lọc theo chi nhánh user được gán** (BR-PERM-01): kế toán CN chỉ thấy chi nhánh được phép; kế toán tổng thấy toàn bộ.

Tất cả **aggregate trong RAM bằng JS**, join FK inline per-row (không GROUP BY / window fn, không root `{[id]:X}` map — theo convention).

## Deliverables

- `apps/api/src/modules/accounting/deposit-vouchers/deposit-dashboard/deposit-dashboard.service.ts` — `DepositDashboardService` với `getInTransit(query, actor)` và `getOrgBalance(query, actor)`.
- `apps/api/src/modules/accounting/deposit-vouchers/deposit-dashboard/deposit-dashboard.controller.ts` — `GET /deposit-transfers/in-transit`, `GET /deposit/dashboard` (`@UseGuards(PermissionGuard, BranchScopeGuard)`, `@Actor()`).
- `.../deposit-dashboard/dto/in-transit-query.dto.ts` — `branchId?`, `accountId?`, `staleDays?(default 3)`.
- `.../deposit-dashboard/dto/deposit-dashboard-response.dto.ts` — `InTransitRowDto`, `InTransitReportDto`, `BranchBalanceDto`, `AccountBalanceDto`, `OrgBalanceDashboardDto` (`@ApiProperty` đầy đủ).
- Đăng ký `DepositDashboardController` + `DepositDashboardService` trong `deposit-vouchers.module.ts`.
- Seed permission `accounting.deposit_dashboard.read` (dùng cho cả 2 endpoint đọc; `in-transit` cũng chấp nhận `accounting.deposit_transfer.read` — chọn 1, thống nhất với DFB-02).

## Acceptance Criteria

- [ ] **BR-TRF-02 / R5**: `getInTransit` trả mọi transfer `status = DANG_CHUYEN` trong phạm vi chi nhánh user; `total = Σ amount`. Sau khi B confirm (status → HOAN_TAT), khoản đó **biến mất** khỏi báo cáo.
- [ ] **Bảo toàn tổng quỹ**: `getOrgBalance.grandTotal === Σ(accountBalances) + inTransitTotal`, và giá trị này **không đổi** giữa 3 mốc create/confirm (verify ở E2E DFB-06). `inTransitTotal` = tổng báo cáo in-transit trong cùng phạm vi.
- [ ] **BR-PERM-01 / UAT-13**: cả 2 endpoint lọc theo `actor` branch scope. Với user chỉ được gán CN Nguyễn Trãi: dashboard **không** liệt kê tài khoản/số dư CN 211 Đà Nẵng; in-transit chỉ hiện transfer mà `from_branch_id` **hoặc** `to_branch_id` thuộc chi nhánh được gán. Kế toán tổng (đủ quyền/đủ branch) thấy tất cả.
- [ ] **BR-TRF-04**: mỗi dòng in-transit có `daysInTransit` (= today − initiated_at) và `isOverdue = daysInTransit > staleDays` (staleDays mặc định 3, override qua query).
- [ ] Join inline per-row: mỗi `InTransitRowDto` mang `fromBranchName`/`toBranchName`/`fromAccountName`/`toAccountName` inline (không trả map `{[id]:branch}`). Dashboard trả `branches[] { branchId, branchName, accounts[] {accountId, name, type, balance}, branchTotal }`.
- [ ] Aggregate bằng JS: fetch raw rows (`deposit_transfer` DANG_CHUYEN; `deposit_accounts` ACTIVE) rồi group/sum trong RAM — **không** SQL `GROUP BY`/window fn.
- [ ] Mọi query scope `actor.organizationId`; branch filter áp dụng trước khi trả (không tính tổng rồi mới cắt).
- [ ] Read-only: không đổi `IdempotencyInterceptor`, không mutate.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `pnpm --filter @erp/api lint` xanh.
- [ ] Spec phủ: in-transit chỉ DANG_CHUYEN, total đúng, isOverdue theo staleDays; dashboard grandTotal = accounts + in-transit; branch-scope loại chi nhánh không được gán.
- [ ] Không đổi schema; `synchronize` giữ `false`.
- [ ] Endpoint mới → openapi regen ở TKT-DFB-04.
- [ ] Không có tiếng Việt trong backend source.
- [ ] Không TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
@Injectable()
export class DepositDashboardService {
  constructor(
    @InjectRepository(DepositTransferEntity) private readonly transfers: Repository<DepositTransferEntity>,
    @InjectRepository(DepositAccountEntity) private readonly accounts: Repository<DepositAccountEntity>,
    @InjectRepository(BranchEntity) private readonly branches: Repository<BranchEntity>,
  ) {}

  /** BR-TRF-02 / R5 — mọi khoản còn DANG_CHUYEN trong phạm vi chi nhánh user. */
  async getInTransit(q: InTransitQueryDto, actor: ActorContext): Promise<InTransitReportDto> {
    const allowed = allowedBranchIds(actor);                 // BR-PERM-01: branchIds user được gán (null = tổng)
    const rows = await this.transfers.find({
      where: { organizationId: actor.organizationId, status: DepositTransferStatus.DANG_CHUYEN },
      order: { initiatedAt: 'ASC' },
    });
    const scoped = rows.filter(t => allowed == null
      || allowed.includes(t.fromBranchId) || allowed.includes(t.toBranchId)); // A gửi HOẶC B nhận
    const [brMap, acMap] = await this.lookup(scoped, actor); // inline join maps (nội bộ, không trả ra)
    const staleDays = q.staleDays ?? 3;
    const data = scoped.map(t => {
      const days = daysBetween(t.initiatedAt, new Date());
      return {
        id: t.id, amount: t.amount,
        fromBranchId: t.fromBranchId, fromBranchName: brMap.get(t.fromBranchId)?.name,
        toBranchId: t.toBranchId,     toBranchName: brMap.get(t.toBranchId)?.name,
        fromAccountName: acMap.get(t.fromAccountId)?.name,
        toAccountName: acMap.get(t.toAccountId)?.name,
        initiatedAt: t.initiatedAt, initiatedBy: t.initiatedBy,
        daysInTransit: days, isOverdue: days > staleDays,      // BR-TRF-04
      } satisfies InTransitRowDto;
    });
    return { total: sumMoney(data.map(d => d.amount)), staleDays, data };
  }

  /** Dashboard số dư đa chi nhánh; grandTotal = accounts + in-transit (bảo toàn tổng quỹ). */
  async getOrgBalance(q: unknown, actor: ActorContext): Promise<OrgBalanceDashboardDto> {
    const allowed = allowedBranchIds(actor);
    const accs = (await this.accounts.find({
      where: { organizationId: actor.organizationId, status: 'ACTIVE' } }))
      .filter(a => allowed == null || allowed.includes(a.branchId));   // BR-PERM-01
    const branchesById = groupBy(accs, a => a.branchId);               // JS group (không SQL GROUP BY)
    const brNames = await this.branchNames([...branchesById.keys()], actor);
    const branches = [...branchesById.entries()].map(([branchId, list]) => ({
      branchId, branchName: brNames.get(branchId),
      accounts: list.map(a => ({ accountId: a.id, name: a.name, type: a.type, balance: a.balance })),
      branchTotal: sumMoney(list.map(a => a.balance)),
    }));
    const accountsTotal = sumMoney(branches.map(b => b.branchTotal));
    const inTransitTotal = (await this.getInTransit({} as InTransitQueryDto, actor)).total;
    return { branches, accountsTotal, inTransitTotal,
      grandTotal: addMoney(accountsTotal, inTransitTotal) };          // R5: bất biến
  }
}
```

Controller:

```ts
@UseGuards(PermissionGuard, BranchScopeGuard)
@Controller()
export class DepositDashboardController {
  @Get('deposit-transfers/in-transit') @RequirePermission('accounting.deposit_dashboard.read')
  inTransit(@Query() q: InTransitQueryDto, @Actor() a: ActorContext) { return this.svc.getInTransit(q, a); }

  @Get('deposit/dashboard') @RequirePermission('accounting.deposit_dashboard.read')
  dashboard(@Actor() a: ActorContext) { return this.svc.getOrgBalance({}, a); }
}
```

**Reuse**: pattern aggregate-in-RAM + inline join của `cash-ledger.service.ts` (SQL SUM/COUNT scalar, running balance JS, JOIN inline per-row); helper money (`numeric` string, không float — NFR-06). `allowedBranchIds(actor)` = danh sách `actor.branchIds` (từ JWT); `null` khi user có quyền tổng/đủ chi nhánh (thống nhất với cách BranchScopeGuard xử lý). Số dư lấy trực tiếp `deposit_accounts.balance` (real-time, GĐ1) — **không** cộng dồn movement lại.

## Testing Strategy

- Unit (`deposit-dashboard.service.spec.ts`, mock repos):
  - `getInTransit`: seed 2 DANG_CHUYEN + 1 HOAN_TAT → chỉ 2 dòng, total đúng; `isOverdue` bật khi initiated_at cũ hơn staleDays.
  - branch-scope: actor branchIds=[A] → thấy transfer A→B (A là nguồn) và transfer C→A (A là đích), **không** thấy C→D.
  - `getOrgBalance`: 2 chi nhánh × N tài khoản → branchTotal/accountsTotal đúng; grandTotal = accountsTotal + inTransitTotal; actor giới hạn 1 CN → loại tài khoản CN khác.
- E2E (DFB-06): bất biến grandTotal qua create→confirm và in-transit clear.

## Dependencies

- Depends on: TKT-DFB-02 (`deposit_transfer` được populate qua create/confirm), TKT-DFB-01 (bảng + status).
- Blocks: TKT-DFB-04.
