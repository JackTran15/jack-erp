import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfills the default Chart of Accounts for organizations created before a
 * given code was added to DEFAULT_COA.
 *
 * `CoaSeederService.seedForOrganization` (which tops up missing codes) only runs
 * when an organization is created, so an org seeded before TK 113 "Tiền đang
 * chuyển" existed never received it — and every fund-move flow that resolves 113
 * (fund swap "Chuyển tiền gửi thành tiền mặt", deposit/cash inter-branch
 * transfers) failed with "Account 113 is not configured in the chart of accounts".
 *
 * Codes are inserted per organization only where absent, so re-running is a
 * no-op. Parent links are resolved in a second pass, after every root exists.
 */

interface DefaultAccount {
  code: string;
  name: string;
  type: string;
  parent?: string;
}

// Mirrors DEFAULT_COA in coa-seeder.service.ts. Kept as a literal: a migration
// must describe the schema/data as of the moment it ran, not follow later edits
// to application code.
const DEFAULT_COA: DefaultAccount[] = [
  { code: '111', name: 'Tiền mặt', type: 'ASSET' },
  { code: '1111', name: 'Tiền Việt Nam', type: 'ASSET', parent: '111' },
  { code: '112', name: 'Tiền gửi ngân hàng', type: 'ASSET' },
  { code: '113', name: 'Tiền đang chuyển', type: 'ASSET' },
  { code: '131', name: 'Phải thu khách hàng', type: 'ASSET' },
  { code: '156', name: 'Hàng hóa', type: 'ASSET' },
  { code: '331', name: 'Phải trả người bán', type: 'LIABILITY' },
  { code: '3331', name: 'Thuế GTGT phải nộp', type: 'LIABILITY' },
  { code: '411', name: 'Vốn đầu tư của chủ sở hữu', type: 'EQUITY' },
  { code: '421', name: 'Lợi nhuận chưa phân phối', type: 'EQUITY' },
  { code: '511', name: 'Doanh thu bán hàng', type: 'REVENUE' },
  { code: '521', name: 'Các khoản giảm trừ doanh thu', type: 'REVENUE' },
  { code: '711', name: 'Thu nhập khác', type: 'REVENUE' },
  { code: '632', name: 'Giá vốn hàng bán', type: 'EXPENSE' },
  { code: '641', name: 'Chi phí bán hàng', type: 'EXPENSE' },
  { code: '6417', name: 'Chi phí dịch vụ ngân hàng', type: 'EXPENSE', parent: '641' },
  { code: '642', name: 'Chi phí quản lý doanh nghiệp', type: 'EXPENSE' },
  { code: '811', name: 'Chi phí khác', type: 'EXPENSE' },
  { code: '911', name: 'Xác định kết quả kinh doanh', type: 'EQUITY' },
];

export class BackfillDefaultCoaAccounts1787500000001
  implements MigrationInterface
{
  name = 'BackfillDefaultCoaAccounts1787500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orgs: { id: string }[] = await queryRunner.query(
      `SELECT DISTINCT "organization_id" AS id FROM "accounts"`,
    );

    for (const org of orgs) {
      for (const account of DEFAULT_COA) {
        await queryRunner.query(
          `INSERT INTO "accounts" ("organization_id", "code", "name", "type", "is_active", "created_by")
           SELECT $1::varchar, $2::varchar, $3::varchar, $4::accounts_type_enum, true, 'migration'
           WHERE NOT EXISTS (
             SELECT 1 FROM "accounts"
             WHERE "organization_id" = $1::varchar AND "code" = $2::varchar
           )`,
          [org.id, account.code, account.name, account.type],
        );
      }

      // Second pass: a child inserted above has no parent link yet, and an org
      // that already had the child may never have had one either.
      for (const account of DEFAULT_COA.filter((a) => a.parent)) {
        await queryRunner.query(
          `UPDATE "accounts" child
             SET "parent_account_id" = parent."id"
           FROM "accounts" parent
           WHERE child."organization_id" = $1::varchar
             AND child."code" = $2::varchar
             AND child."parent_account_id" IS NULL
             AND parent."organization_id" = $1::varchar
             AND parent."code" = $3::varchar`,
          [org.id, account.code, account.parent],
        );
      }
    }
  }

  /**
   * Intentionally a no-op: the inserted accounts are indistinguishable from
   * hand-created ones and may already be referenced by journal lines, so
   * deleting them on revert would be destructive.
   */
  public async down(): Promise<void> {}
}
