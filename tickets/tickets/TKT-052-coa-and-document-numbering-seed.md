# TKT-052 COA and document numbering seed

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Auto-seed Chart of Accounts (COA) mặc định và khởi tạo document numbering sequences cho organization/branch mới. Đây là root cause khiến journal posting fail silently — `validateAccounts()` throw `BadRequestException` vì `accountId` truyền vào không tồn tại trong bảng `accounts`. Sau ticket này, mọi org mới có sẵn COA chuẩn Việt Nam (theo thông tư 200/2014/TT-BTC tối giản) và branch mới có sẵn sequences `JOURNAL`, `INVOICE`, etc.

## Deliverables

- `apps/api/src/modules/accounting/seeders/coa-seeder.service.ts` — service seed COA chuẩn.
- `apps/api/src/modules/document-numbering/seeders/sequence-seeder.service.ts` — service seed sequences.
- Hook seeder vào org creation flow (`OrganizationService.create()`):
  - Sau khi create org → call `coaSeeder.seedForOrganization(orgId)`.
- Hook seeder vào branch creation flow (`BranchService.create()`):
  - Sau khi create branch → call `sequenceSeeder.seedForBranch(branchId, orgId)`.
- Backfill migration: `1779100000000-BackfillCoaForExistingOrgs.ts` — seed COA cho orgs hiện có chưa có COA.
- Default account mapping config: file JSON / TS const map `AccountType + role → code` (Cash=111, Bank=112, AR=131, Payable=331, Revenue=511, COGS=632, Expense=642, etc.).

## Acceptance Criteria

- [ ] Tạo org mới → bảng `accounts` có ~15 row chuẩn (111, 112, 131, 331, 411, 421, 511, 632, 642, 911, etc.).
- [ ] Account hierarchy đúng (cha-con qua `parentAccountId`), `isActive=true`.
- [ ] Tạo branch mới → bảng `document_numbering_sequences` có entries cho `INVOICE`, `JOURNAL`, `RETURN`, `EXCHANGE`.
- [ ] Backfill migration chạy idempotent (re-run không tạo duplicate).
- [ ] Checkout invoice trong org mới → journal posting thành công (không vào DLQ).

## Definition of Done

- [ ] PR có seeder services + migration + hooks + unit tests; pass CI.
- [ ] Unit test: seeder tạo đúng số account; idempotent; backfill skip org đã có COA.
- [ ] Integration test: create org → query accounts → có 15 rows; create branch → query sequences → có 4 rows.
- [ ] Manual verify: deploy lên staging → tạo org test → checkout invoice → journal_entries có row.

## Tech Approach

### Default COA structure (Vietnamese accounting standards — simplified)

```typescript
const DEFAULT_COA = [
  // ASSETS
  { code: '111', name: 'Tiền mặt', type: 'ASSET', parent: null },
  { code: '1111', name: 'Tiền Việt Nam', type: 'ASSET', parent: '111' },
  { code: '112', name: 'Tiền gửi ngân hàng', type: 'ASSET', parent: null },
  { code: '131', name: 'Phải thu khách hàng', type: 'ASSET', parent: null },
  { code: '156', name: 'Hàng hóa', type: 'ASSET', parent: null },

  // LIABILITIES
  { code: '331', name: 'Phải trả người bán', type: 'LIABILITY', parent: null },
  { code: '3331', name: 'Thuế GTGT phải nộp', type: 'LIABILITY', parent: null },

  // EQUITY
  { code: '411', name: 'Vốn đầu tư của chủ sở hữu', type: 'EQUITY', parent: null },
  { code: '421', name: 'Lợi nhuận chưa phân phối', type: 'EQUITY', parent: null },

  // REVENUE
  { code: '511', name: 'Doanh thu bán hàng', type: 'REVENUE', parent: null },
  { code: '521', name: 'Các khoản giảm trừ doanh thu', type: 'REVENUE', parent: null },

  // EXPENSE
  { code: '632', name: 'Giá vốn hàng bán', type: 'EXPENSE', parent: null },
  { code: '641', name: 'Chi phí bán hàng', type: 'EXPENSE', parent: null },
  { code: '642', name: 'Chi phí quản lý doanh nghiệp', type: 'EXPENSE', parent: null },

  // SUMMARY
  { code: '911', name: 'Xác định kết quả kinh doanh', type: 'EQUITY', parent: null },
];
```

### Seeder service

```typescript
// apps/api/src/modules/accounting/seeders/coa-seeder.service.ts
@Injectable()
export class CoaSeederService {
  async seedForOrganization(organizationId: string, actorId: string): Promise<void> {
    const existing = await this.accountRepo.count({ where: { organizationId } });
    if (existing > 0) {
      this.logger.log(`Org ${organizationId} already has COA, skipping seed`);
      return;
    }

    const codeToId = new Map<string, string>();
    // First pass: create accounts without parent
    for (const a of DEFAULT_COA.filter(x => !x.parent)) {
      const saved = await this.accountRepo.save(this.accountRepo.create({
        organizationId, code: a.code, name: a.name, type: a.type, isActive: true, createdBy: actorId,
      }));
      codeToId.set(a.code, saved.id);
    }
    // Second pass: create accounts with parent
    for (const a of DEFAULT_COA.filter(x => x.parent)) {
      await this.accountRepo.save(this.accountRepo.create({
        organizationId, code: a.code, name: a.name, type: a.type,
        parentAccountId: codeToId.get(a.parent!), isActive: true, createdBy: actorId,
      }));
    }
  }
}
```

### Hook into OrganizationService

```typescript
// In OrganizationService.create()
const org = await this.orgRepo.save(...);
await this.coaSeederService.seedForOrganization(org.id, actor.userId);
return org;
```

### Backfill migration

```typescript
public async up(qr: QueryRunner): Promise<void> {
  const orgs = await qr.query(`SELECT id FROM organizations`);
  for (const { id } of orgs) {
    const cnt = await qr.query(`SELECT count(*) FROM accounts WHERE organization_id = $1`, [id]);
    if (cnt[0].count > 0) continue;
    // Insert default COA — duplicated logic acceptable in migration
    await this.insertDefaultCoa(qr, id);
  }
}
```

## Testing Strategy

- Unit: seeder idempotent, account hierarchy đúng.
- Integration: create org via API → verify accounts table count = 15.
- Migration: run on DB có 2 orgs (1 đã có COA, 1 chưa) → verify chỉ org chưa có được seed.

## Dependencies

- Requires: `AccountEntity` (TKT-015), `DocumentNumberingService` (TKT-022), `OrganizationService` + `BranchService`.
- Related: TKT-050 (journal posting cần COA tồn tại).
