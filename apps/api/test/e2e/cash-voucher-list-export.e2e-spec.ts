import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  authHeader,
  createTestApp,
  request,
  resetDatabase,
  seedBaseData,
  SeedResult,
} from './setup/test-app';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { StringOperator } from '../../src/common/filters/filter.dto';
import { MAX_REPORT_ROWS } from '../../src/modules/reporting/report-core/row-cap.util';

/**
 * `POST /v2/cash-vouchers/export` (ADR-06): the export route runs the exact
 * same query as `POST /v2/cash-vouchers/search`, so a workbook can never show
 * a row the grid's filter would have excluded, and never fewer rows than the
 * grid's own total.
 *
 * Fixtures go straight into `cash_receipts` via SQL rather than through
 * `POST /cash-receipts`: the search/export path only reads persisted columns,
 * so a real create per row (document numbering, contra account resolution,
 * ledger posting) would test the create flow, not this one — same reasoning
 * `inventory-reports-row-cap.e2e-spec.ts` uses for its over-cap fixture.
 */
describe('Cash voucher list export (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;
  let cashAccountId: string;
  let contraAccountId: string;

  /** CashVoucherSearchV2Dto.limit default — the fixture must exceed this. */
  const DEFAULT_PAGE_SIZE = 20;
  const IN_FILTER_COUNT = DEFAULT_PAGE_SIZE + 5;
  const IN_FILTER_PREFIX = 'EXPORT-IN-';
  const OUT_OF_FILTER_NUMBER = 'EXPORT-OUT-1';
  const SPLIT_PARTY_NUMBER = 'PT-SPLIT-PARTY';
  /** Past the shared row cap, so the export route actually refuses it. */
  const OVER_CAP_ROWS = MAX_REPORT_ROWS + 2_000;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  /** Read a workbook back from the response bytes — assert on the real file. */
  async function readSheet(body: Buffer): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    return workbook.worksheets[0];
  }

  /** Row index of the column header — everything below it is data. */
  function headerRowNumber(sheet: ExcelJS.Worksheet, firstLabel: string): number {
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (sheet.getRow(r).getCell(1).value === firstLabel) return r;
    }
    throw new Error(`header row starting with "${firstLabel}" not found`);
  }

  /** The "Số chứng từ" column, top to bottom, below the header row. */
  function documentNumbersOf(sheet: ExcelJS.Worksheet): unknown[] {
    const headerRow = headerRowNumber(sheet, 'Ngày tạo');
    const values: unknown[] = [];
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      values.push(sheet.getRow(r).getCell(2).value);
    }
    return values;
  }

  async function insertReceipt(
    documentNumber: string,
    party: string | null = null,
    person: string | null = null,
  ): Promise<void> {
    await ds.query(
      `INSERT INTO cash_receipts
         (id, organization_id, branch_id, document_number, voucher_date, status,
          purpose, cash_account_id, contra_account_id, total_amount,
          partner_name_snapshot, payer_name,
          created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, CURRENT_DATE, 'POSTED', 'OTHER',
               $4::uuid, $5::uuid, 1000, $7, $8, $6, NOW(), NOW())`,
      [
        seed.organizationId,
        seed.branchId,
        documentNumber,
        cashAccountId,
        contraAccountId,
        seed.userId,
        party,
        person,
      ],
    );
  }

  /**
   * Set-based insert, not a loop: the point is real scale past the cap, and
   * inserting `OVER_CAP_ROWS` one at a time would make the suite unusable.
   * `document_number` stays NULL — the partial unique index on it only applies
   * when it is set, and these rows only need to exist, not be addressable.
   */
  async function seedOverCapReceipts(): Promise<void> {
    await ds.query(
      `INSERT INTO cash_receipts
         (id, organization_id, branch_id, document_number, voucher_date, status,
          purpose, cash_account_id, contra_account_id, total_amount,
          created_by, created_at, updated_at)
       SELECT gen_random_uuid(), $1, $2, NULL, CURRENT_DATE, 'POSTED', 'OTHER',
              $3::uuid, $4::uuid, 1000, $5, NOW(), NOW()
       FROM generate_series(1, $6) g`,
      [seed.organizationId, seed.branchId, cashAccountId, contraAccountId, seed.userId, OVER_CAP_ROWS],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // `accounting.cash_receipt.read` guards both /search and /export and is
    // not in seedBaseData's default permission set.
    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const permissionKey = 'accounting.cash_receipt.read';
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, 'accounting') ON CONFLICT DO NOTHING`,
      [permissionKey],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
       ON CONFLICT DO NOTHING`,
      [roleId, permissionKey],
    );
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    // FK targets for cash_receipts. Their identity does not matter for a
    // search/export test, only that a valid row exists.
    const cashGlId = randomUUID();
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, '1111', 'Tiền mặt', 'ASSET', true, $3, NOW(), NOW())`,
      [cashGlId, seed.organizationId, seed.userId],
    );
    contraAccountId = randomUUID();
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, '711', 'Thu nhập khác', 'REVENUE', true, $3, NOW(), NOW())`,
      [contraAccountId, seed.organizationId, seed.userId],
    );
    cashAccountId = randomUUID();
    await ds.query(
      `INSERT INTO cash_accounts (id, organization_id, branch_id, name, balance, account_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'Quầy E2E', 0, $4, $5, NOW(), NOW())`,
      [cashAccountId, seed.organizationId, seed.branchId, cashGlId, seed.userId],
    );

    for (let i = 1; i <= IN_FILTER_COUNT; i++) {
      await insertReceipt(`${IN_FILTER_PREFIX}${i}`);
    }
    // Two different identities on one voucher — the only fixture shape that can
    // tell a two-column export from a one-column one.
    await insertReceipt(SPLIT_PARTY_NUMBER, 'kkkk', '123123');
    await insertReceipt(OUT_OF_FILTER_NUMBER);
    await seedOverCapReceipts();
  }, 300_000);

  afterAll(async () => {
    // Bound app.close(): kafkajs teardown can hang and report a fake failure.
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  it('exports every row the filter matches, and only those rows (AC-17)', async () => {
    const filter = {
      documentNumber: { operator: StringOperator.CONTAINS, value: IN_FILTER_PREFIX },
    };

    // /search keeps Nest's POST default (201); only /export sets @HttpCode(200).
    const search = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/search')
      .set(headers())
      .send(filter)
      .expect(201);

    // Guard the guard: if the fixture ever stops exceeding one page, the row
    // count assertion below would pass without proving anything.
    expect(search.body.total).toBeGreaterThan(DEFAULT_PAGE_SIZE);
    expect(search.body.total).toBe(IN_FILTER_COUNT);

    const exported = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/export')
      .set(headers())
      .responseType('blob')
      .send(filter)
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

    const sheet = await readSheet(exported.body);
    const documentNumbers = documentNumbersOf(sheet);

    // Row count equals /search's total for the same filter, not one page.
    expect(documentNumbers).toHaveLength(search.body.total);
    for (let i = 1; i <= IN_FILTER_COUNT; i++) {
      expect(documentNumbers).toContain(`${IN_FILTER_PREFIX}${i}`);
    }
    // The voucher outside the filter must not appear — a fetcher that ignored
    // the filter and exported every voucher in scope would still pass the
    // row-count assertion above, but would fail this one.
    expect(documentNumbers).not.toContain(OUT_OF_FILTER_NUMBER);
  });

  it('prints party and person as two adjacent columns (AC-14)', async () => {
    const exported = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/export')
      .set(headers())
      .responseType('blob')
      .send({
        documentNumber: { operator: StringOperator.EQUALS, value: SPLIT_PARTY_NUMBER },
      })
      .expect(200);

    const sheet = await readSheet(exported.body);
    const headerRow = headerRowNumber(sheet, 'Ngày tạo');

    // Adjacency is the promise EXPORT_COLUMNS makes to the grid ("same order the
    // treasury grid renders them"), and it is the part that rots silently.
    expect(sheet.getRow(headerRow).getCell(6).value).toBe('Đối tượng nộp/nhận');
    expect(sheet.getRow(headerRow).getCell(7).value).toBe('Người nộp/nhận');

    const dataRow = sheet.getRow(headerRow + 1);
    expect(dataRow.getCell(2).value).toBe(SPLIT_PARTY_NUMBER);
    // Distinct values: a projection writing one source into both cells, or
    // falling back from one to the other, fails here and nowhere else.
    expect(dataRow.getCell(6).value).toBe('kkkk');
    expect(dataRow.getCell(7).value).toBe('123123');
  });

  it('answers 200 with only a header row when the filter matches nothing (AC-18)', async () => {
    const filter = {
      documentNumber: { operator: StringOperator.EQUALS, value: 'NO-SUCH-DOCUMENT-NUMBER' },
    };

    const search = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/search')
      .set(headers())
      .send(filter)
      .expect(201);
    expect(search.body.total).toBe(0);

    const exported = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/export')
      .set(headers())
      .responseType('blob')
      .send(filter)
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

    const sheet = await readSheet(exported.body);
    expect(documentNumbersOf(sheet)).toHaveLength(0);
    // The header row itself is still there.
    expect(() => headerRowNumber(sheet, 'Ngày tạo')).not.toThrow();
  });

  it('refuses to export past the row cap, with a JSON body rather than a file', async () => {
    // No filter: the fixture's over-cap rows plus the AC-17 fixture together
    // exceed MAX_REPORT_ROWS regardless of any single column filter.
    const res = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/export')
      .set(headers())
      .send({})
      .expect(400);

    // The response must never have been opened as a file: JSON content type,
    // a plain parsed body, not a Buffer of xlsx bytes.
    expect(res.headers['content-type']).toContain('application/json');
    expect(Buffer.isBuffer(res.body)).toBe(false);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message).toContain(String(MAX_REPORT_ROWS));
  });
});
