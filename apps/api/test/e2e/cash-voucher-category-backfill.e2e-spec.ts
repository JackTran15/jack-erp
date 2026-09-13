import 'reflect-metadata';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { OrganizationEntity } from '../../src/modules/organization/organization.entity';
import { CashVoucherCategoryEntity } from '../../src/modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';
import { DEFAULT_CASH_VOUCHER_CATEGORIES } from '../../src/modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';
import { CashVoucherCategoryDirection } from '../../src/modules/accounting/cash-vouchers/enums';
import { BackfillCashVoucherCategoryOptions1789930000000 } from '../../src/database/migrations/1789930000000-BackfillCashVoucherCategoryOptions';

/**
 * E2E for the cash voucher category backfill migration (T-01-02) — runs real
 * SQL against `erp_test`.
 *
 * Same shape as `storage-default-issuing.e2e-spec.ts`: a bare DataSource with
 * `synchronize`, no Nest app. `beforeAll` seeds organizations whose categories
 * stand in for "data that existed before this feature shipped", then calls the
 * migration's real `up()` twice on a QueryRunner, snapshotting after each run.
 */

const TEST_DB_NAME = process.env.E2E_DB_NAME || 'erp_test';
if (!/test/i.test(TEST_DB_NAME)) {
  throw new Error(
    `Refusing to run against "${TEST_DB_NAME}": this suite drops every table.`,
  );
}

type Row = [code: string, name: string, direction: CashVoucherCategoryDirection, displayOrder: number];

const IN = CashVoucherCategoryDirection.IN;
const OUT = CashVoucherCategoryDirection.OUT;

/** DEFAULT_CASH_VOUCHER_CATEGORIES as it was before this feature. */
const PREVIOUS_DEFAULTS: Row[] = [
  ['THU_BAN_HANG', 'Thu từ bán hàng', IN, 1],
  ['THU_KHAC', 'Thu khác', IN, 2],
  ['THU_THANH_LY_TS', 'Thu thanh lý tài sản', IN, 3],
  ['THU_BAN_PHE_LIEU', 'Thu từ bán phế liệu', IN, 4],
  ['THU_HOAN_UNG', 'Thu hoàn ứng', IN, 5],
  ['THU_CH_KHAC', 'Thu từ cửa hàng khác chuyển đến', IN, 6],
  ['THU_TIEN_MAT_NHAP_QUY', 'Thu nhận tiền mặt về nhập quỹ', IN, 7],
  ['THU_TIEN_GUI_NH', 'Thu nhận tiền gửi vào ngân hàng', IN, 8],
  ['THU_NO_KH', 'Thu nợ khách hàng', IN, 9],
  ['CHI_TIEN_DIEN', 'Tiền điện', OUT, 10],
  ['CHI_TIEN_DIEN_THOAI', 'Tiền điện thoại', OUT, 11],
  ['CHI_TIEN_INTERNET', 'Tiền internet', OUT, 12],
  ['CHI_TIEN_NUOC', 'Tiền nước', OUT, 13],
  ['CHI_THUE_CUA_HANG', 'Tiền thuê cửa hàng', OUT, 14],
  ['CHI_LUONG', 'Tiền lương', OUT, 15],
  ['CHI_THUONG', 'Tiền thưởng', OUT, 16],
  ['CHI_PHU_CAP', 'Tiền phụ cấp', OUT, 17],
  ['CHI_CCDC', 'Công cụ dụng cụ', OUT, 18],
  ['CHI_TSCD', 'Tài sản cố định', OUT, 19],
  ['CHI_KHAC', 'Chi khác', OUT, 20],
  ['CHI_TIEP_KHACH', 'Chi tiếp khách', OUT, 21],
  ['CHI_VAN_PHONG_PHAM', 'Mua văn phòng phẩm', OUT, 22],
  ['CHI_TAM_UNG', 'Chi tạm ứng', OUT, 23],
  ['CHI_MUA_HANG', 'Chi mua hàng hóa', OUT, 24],
  ['CHI_CHUYEN_TIEN_CH', 'Chi chuyển tiền sang cửa hàng khác', OUT, 25],
  ['CHI_RUT_TIEN_GUI', 'Rút tiền gửi về nhập quỹ', OUT, 26],
  ['CHI_GUI_TIEN_NH', 'Chi gửi tiền vào ngân hàng', OUT, 27],
  ['CHI_NO_NCC', 'Chi trả nợ nhà cung cấp', OUT, 28],
  ['BANK_FEE', 'Phí ngân hàng', OUT, 29],
];

const EXPECTED = DEFAULT_CASH_VOUCHER_CATEGORIES.map(
  ({ code, name, direction, displayOrder }) => ({ code, name, direction, displayOrder }),
).sort((a, b) => a.displayOrder - b.displayOrder);

describe('Cash voucher category backfill migration (e2e)', () => {
  let ds: DataSource;
  let orgRepo: Repository<OrganizationEntity>;
  let categoryRepo: Repository<CashVoucherCategoryEntity>;
  const userId = randomUUID();

  let orgStandardId: string;
  let orgCustomizedId: string;
  let orgMissingBankFeeId: string;
  let orgEmptyId: string;
  let waterIdBefore: string;
  let toolsIdBefore: string;
  let afterFirstRun: unknown[];
  let afterSecondRun: unknown[];

  const createOrg = async (label: string): Promise<string> => {
    // OrganizationEntity inherits BaseEntity's required organization_id; an
    // organization is its own tenant.
    const id = randomUUID();
    const org = await orgRepo.save(
      orgRepo.create({
        id,
        organizationId: id,
        name: `${label} ${randomUUID()}`,
        contactEmail: `${randomUUID()}@e2e.local`,
        createdBy: userId,
      }),
    );
    return org.id;
  };

  const insertCategories = async (organizationId: string, rows: Row[]) => {
    await categoryRepo.save(
      rows.map(([code, name, direction, displayOrder]) =>
        categoryRepo.create({
          organizationId,
          code,
          name,
          direction,
          displayOrder,
          isActive: true,
          createdBy: userId,
        }),
      ),
    );
  };

  const liveCategories = (organizationId: string) =>
    categoryRepo.find({
      where: { organizationId },
      order: { displayOrder: 'ASC' },
    });

  const snapshot = (): Promise<unknown[]> =>
    ds.query(
      `SELECT organization_id, code, name, direction::text AS direction, display_order,
              is_active, deleted_at, updated_at
         FROM cash_voucher_categories
        WHERE organization_id = ANY($1)
        ORDER BY organization_id, code`,
      [[orgStandardId, orgCustomizedId, orgMissingBankFeeId, orgEmptyId]],
    );

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433', 10),
      database: TEST_DB_NAME,
      username: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASS || 'erp_secret',
    };

    const cleaner = await new DataSource(connection).initialize();
    const [{ current_database: live }]: Array<{ current_database: string }> =
      await cleaner.query('SELECT current_database()');
    if (!/test/i.test(live)) {
      await cleaner.destroy();
      throw new Error(`Refusing to drop schema on "${live}".`);
    }
    await cleaner.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await cleaner.destroy();

    ds = await new DataSource({
      ...connection,
      entities: [path.join(__dirname, '..', '..', 'src', '**', '*.entity.{ts,js}')],
      synchronize: true,
      logging: false,
    }).initialize();
    orgRepo = ds.getRepository(OrganizationEntity);
    categoryRepo = ds.getRepository(CashVoucherCategoryEntity);

    // A — the previous default list, untouched.
    orgStandardId = await createOrg('Org mặc định cũ');
    await insertCategories(orgStandardId, PREVIOUS_DEFAULTS);
    waterIdBefore = (await categoryRepo.findOneByOrFail({ organizationId: orgStandardId, code: 'CHI_TIEN_NUOC' })).id;
    toolsIdBefore = (await categoryRepo.findOneByOrFail({ organizationId: orgStandardId, code: 'CHI_CCDC' })).id;

    // B — edited through the category admin page: a renamed and a re-ordered
    // default, a deleted default, and a hand-made category that shares a name
    // with one of the new defaults.
    orgCustomizedId = await createOrg('Org đã tuỳ biến');
    await insertCategories(orgCustomizedId, [
      ...PREVIOUS_DEFAULTS.map((row): Row => {
        if (row[0] === 'CHI_TIEN_NUOC') return [row[0], 'Nước máy', row[2], row[3]];
        if (row[0] === 'CHI_LUONG') return [row[0], row[1], row[2], 99];
        return row;
      }),
      ['VC01', 'Tiền vận chuyển', OUT, 50],
    ]);
    await categoryRepo.softDelete({ organizationId: orgCustomizedId, code: 'CHI_TIEP_KHACH' });

    // C — seeded before BANK_FEE existed.
    orgMissingBankFeeId = await createOrg('Org thiếu BANK_FEE');
    await insertCategories(
      orgMissingBankFeeId,
      PREVIOUS_DEFAULTS.filter(([code]) => code !== 'BANK_FEE'),
    );

    // D — no categories at all.
    orgEmptyId = await createOrg('Org rỗng');

    const migration = new BackfillCashVoucherCategoryOptions1789930000000();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await migration.up(runner);
    afterFirstRun = await snapshot();
    await migration.up(runner);
    afterSecondRun = await snapshot();
    await runner.release();
  }, 180_000);

  afterAll(async () => {
    const orgIds = [orgStandardId, orgCustomizedId, orgMissingBankFeeId, orgEmptyId].filter(Boolean);
    if (ds?.isInitialized) {
      await ds.query('DELETE FROM cash_voucher_categories WHERE organization_id = ANY($1)', [orgIds]);
      await ds.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [orgIds]);
      await ds.destroy();
    }
  });

  it('org có bộ mục cũ: đủ 9 mục thu, 34 mục chi, bằng danh sách mặc định (AC-01, AC-07)', async () => {
    const rows = await liveCategories(orgStandardId);

    expect(rows.filter((r) => r.direction === IN)).toHaveLength(9);
    expect(rows.filter((r) => r.direction === OUT)).toHaveLength(34);
    expect(
      rows.map(({ code, name, direction, displayOrder }) => ({ code, name, direction, displayOrder })),
    ).toEqual(EXPECTED);
    expect(rows.every((r) => r.isActive)).toBe(true);
  });

  it('org có bộ mục cũ: đổi tên CHI_TIEN_NUOC và CHI_CCDC, id giữ nguyên (AC-02)', async () => {
    const water = await categoryRepo.findOneByOrFail({ organizationId: orgStandardId, code: 'CHI_TIEN_NUOC' });
    const tools = await categoryRepo.findOneByOrFail({ organizationId: orgStandardId, code: 'CHI_CCDC' });

    expect(water).toMatchObject({ id: waterIdBefore, name: 'Tiền nước sinh hoạt' });
    expect(tools).toMatchObject({ id: toolsIdBefore, name: 'Mua đồ dùng, công cụ, dụng cụ', displayOrder: 21 });
  });

  it('org đã tuỳ biến: giữ tên và thứ tự org tự đặt (AC-03)', async () => {
    const water = await categoryRepo.findOneByOrFail({ organizationId: orgCustomizedId, code: 'CHI_TIEN_NUOC' });
    const salary = await categoryRepo.findOneByOrFail({ organizationId: orgCustomizedId, code: 'CHI_LUONG' });

    expect(water.name).toBe('Nước máy');
    expect(salary.displayOrder).toBe(99);
  });

  it('org đã tuỳ biến: không hồi sinh mục đã xoá, không chèn mục trùng tên (AC-04)', async () => {
    const hosting = await categoryRepo.findOneOrFail({
      where: { organizationId: orgCustomizedId, code: 'CHI_TIEP_KHACH' },
      withDeleted: true,
    });
    expect(hosting.deletedAt).not.toBeNull();

    const rows = await liveCategories(orgCustomizedId);
    const codes = rows.map((r) => r.code);
    expect(codes).not.toContain('CHI_TIEP_KHACH');
    expect(codes).not.toContain('CHI_TIEN_VAN_CHUYEN');
    expect(rows.filter((r) => r.name === 'Tiền vận chuyển').map((r) => r.code)).toEqual(['VC01']);
    // The name guard skips only the clashing category; the other new ones still land.
    expect(codes).toEqual(expect.arrayContaining(['CHI_UNG_LUONG', 'CHI_TIEN_NUOC_UONG']));
  });

  it('org thiếu BANK_FEE: được bổ sung với display_order 43 (AC-05)', async () => {
    const bankFee = await categoryRepo.findOneByOrFail({ organizationId: orgMissingBankFeeId, code: 'BANK_FEE' });

    expect(bankFee).toMatchObject({ name: 'Phí ngân hàng', direction: OUT, displayOrder: 43, isActive: true });
    expect(await liveCategories(orgMissingBankFeeId)).toHaveLength(43);
  });

  it('org chưa có mục nào: nhận đúng 43 mục bằng danh sách mặc định (AC-07)', async () => {
    const rows = await liveCategories(orgEmptyId);

    expect(
      rows.map(({ code, name, direction, displayOrder }) => ({ code, name, direction, displayOrder })),
    ).toEqual(EXPECTED);
  });

  it('chạy migration lần hai không thêm, sửa hay xoá dòng nào (AC-04)', () => {
    expect(afterFirstRun.length).toBeGreaterThan(0);
    expect(afterSecondRun).toEqual(afterFirstRun);
  });
});
