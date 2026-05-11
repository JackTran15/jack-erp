import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed default Chart of Accounts for organizations that don't have any.
 * Idempotent: skips orgs that already have accounts.
 */
export class BackfillCoaForExistingOrgs1779100000000 implements MigrationInterface {
  name = 'BackfillCoaForExistingOrgs1779100000000';

  private readonly DEFAULT_COA = [
    { code: '111',  name: 'Tiền mặt',                     type: 'ASSET',     parent: null },
    { code: '1111', name: 'Tiền Việt Nam',                type: 'ASSET',     parent: '111' },
    { code: '112',  name: 'Tiền gửi ngân hàng',           type: 'ASSET',     parent: null },
    { code: '131',  name: 'Phải thu khách hàng',          type: 'ASSET',     parent: null },
    { code: '156',  name: 'Hàng hóa',                     type: 'ASSET',     parent: null },
    { code: '331',  name: 'Phải trả người bán',           type: 'LIABILITY', parent: null },
    { code: '3331', name: 'Thuế GTGT phải nộp',           type: 'LIABILITY', parent: null },
    { code: '411',  name: 'Vốn đầu tư của chủ sở hữu',    type: 'EQUITY',    parent: null },
    { code: '421',  name: 'Lợi nhuận chưa phân phối',     type: 'EQUITY',    parent: null },
    { code: '511',  name: 'Doanh thu bán hàng',           type: 'REVENUE',   parent: null },
    { code: '521',  name: 'Các khoản giảm trừ doanh thu', type: 'REVENUE',   parent: null },
    { code: '632',  name: 'Giá vốn hàng bán',             type: 'EXPENSE',   parent: null },
    { code: '641',  name: 'Chi phí bán hàng',             type: 'EXPENSE',   parent: null },
    { code: '642',  name: 'Chi phí quản lý doanh nghiệp', type: 'EXPENSE',   parent: null },
    { code: '911',  name: 'Xác định kết quả kinh doanh',  type: 'EQUITY',    parent: null },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    const orgs: { id: string }[] = await qr.query(`SELECT id FROM organizations`);

    for (const { id: orgId } of orgs) {
      const count: { count: string }[] = await qr.query(
        `SELECT COUNT(*)::int AS count FROM accounts WHERE organization_id = $1`,
        [orgId],
      );
      if (Number(count[0]?.count ?? 0) > 0) continue;

      const codeToId = new Map<string, string>();

      for (const a of this.DEFAULT_COA.filter((x) => !x.parent)) {
        const res: { id: string }[] = await qr.query(
          `INSERT INTO accounts (organization_id, code, name, type, is_active, created_by)
           VALUES ($1, $2, $3, $4::accounts_type_enum, true, $5)
           RETURNING id`,
          [orgId, a.code, a.name, a.type, orgId],
        );
        codeToId.set(a.code, res[0].id);
      }

      for (const a of this.DEFAULT_COA.filter((x) => x.parent)) {
        const parentId = codeToId.get(a.parent!) ?? null;
        await qr.query(
          `INSERT INTO accounts (organization_id, code, name, type, parent_account_id, is_active, created_by)
           VALUES ($1, $2, $3, $4::accounts_type_enum, $5, true, $6)`,
          [orgId, a.code, a.name, a.type, parentId, orgId],
        );
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Intentionally no-op: this is data backfill. Manual cleanup if needed.
  }
}
