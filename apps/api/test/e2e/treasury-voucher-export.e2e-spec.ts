import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
} from './setup/test-app';
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import { DefaultAccountSeederService } from '../../src/modules/accounting/seeders/default-account.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * T-01-05: the second, non-creator user granted as Nhân viên thu/chi on a
 * voucher below — resolved name is `firstName + ' ' + lastName` trimmed
 * (`VoucherStaffResolver.resolveMany`).
 */
const STAFF_NAME = 'Nguyễn Văn A';

/**
 * seedBaseData's fixed identity (test-app.ts: first_name 'Admin', last_name
 * 'User') — the name a voucher falls back to when it names no staff (AC-06).
 */
const CREATOR_NAME = 'Admin User';

/**
 * The two facts T-04-01 (controller wiring) could not honestly assert on its
 * own, per ADR-05: the `Content-Disposition` filename really carries the
 * voucher's type and document number (it is set by `HttpResponseSink`, not by
 * the controller), and the 404 for a missing/other-org id happens **before**
 * the response is opened as a file — a corrupt-but-200 download is the
 * failure mode this guards against.
 *
 * Follows the seeding shape of `treasury-voucher-address.e2e-spec.ts` and
 * `treasury-voucher-party-freetext.e2e-spec.ts`: `CoaSeederService` +
 * `DefaultAccountSeederService` for the contra-account resolution every
 * `create()` needs, plus a hand-granted `*.read`/`*.create` permission set
 * (none of the four kinds are in `seedBaseData`'s default list).
 */
describe('Treasury voucher export (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let depositAccountId: string;
  /** A user in `seed.organizationId`, distinct from `seed.userId`, used as Nhân viên thu/chi (T-01-05). */
  let staffUserId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const accountByCode = async (code: string): Promise<string> => {
    const rows = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [seed.organizationId, code],
    );
    return rows[0].id;
  };

  /** Reads the workbook back from the raw response bytes. */
  async function readWorkbook(body: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    return workbook;
  }

  /** Pulls the quoted filename out of a `Content-Disposition` header value. */
  function filenameFrom(contentDisposition: string | undefined): string {
    const match = /filename="([^"]+)"/.exec(contentDisposition ?? '');
    if (!match) {
      throw new Error(`no filename in Content-Disposition: "${contentDisposition}"`);
    }
    return match[1];
  }

  /**
   * Finds the totals row by its label ("Cộng", every treasury mapper's
   * `totalsLabel`) and returns the value under the "amount" column (grid
   * column 3 — description, categoryName, amount). A merge bug on this exact
   * row is what produced a downloadable-but-unopenable file, so this is the
   * one cell that proves the workbook is genuinely well-formed, not just
   * present.
   */
  function totalsAmountOf(sheet: ExcelJS.Worksheet): unknown {
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (sheet.getRow(r).getCell(1).value === 'Cộng') {
        return sheet.getRow(r).getCell(3).value;
      }
    }
    throw new Error('totals row ("Cộng") not found in sheet');
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(DefaultAccountSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    // A-08: only the read (plus create, to set up each fixture) permission per
    // kind is granted here — none of these eight keys are in seedBaseData's
    // default set, so a passing export proves the permission actually gates
    // the route rather than riding along on a broader admin grant.
    const perms = [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.bank_receipt.create', 'accounting.bank_receipt.read',
      'accounting.bank_payment.create', 'accounting.bank_payment.read',
      'accounting.deposit_account.read',
    ];
    for (const key of perms) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'accounting') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, key],
      );
    }
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    const cashGlId = await accountByCode('1111');
    const accRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quầy E2E', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountId = accRes.body.id;

    // Deposit side: 1121 + a bank + one account, mirroring
    // treasury-voucher-address.e2e-spec.ts.
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    const coaBankId = await accountByCode('1121');
    const bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );
    depositAccountId = randomUUID();
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'Deposit E2E', 'DP1', 'ACC-DP1', 'ERP Test', $4,
               'BANK_ACCOUNT', $5, 0, '2026-01-01', 100000000, false, true,
               'ACTIVE', $6, NOW(), NOW())`,
      [depositAccountId, seed.organizationId, seed.branchId, bankId, coaBankId, seed.userId],
    );

    // T-01-05: a second user in the same org, never logged in — only its id
    // and name matter, as `staffId` / `collectedBy` / `paidBy` on a voucher.
    staffUserId = randomUUID();
    // `VoucherStaffResolver` reconstructs the name as `firstName + ' ' + lastName`
    // trimmed, so the last space-separated word is the last name and everything
    // before it is the first name — not a 2-way split, which would drop "A".
    const staffNameParts = STAFF_NAME.split(' ');
    const staffLastName = staffNameParts[staffNameParts.length - 1];
    const staffFirstName = staffNameParts.slice(0, -1).join(' ');
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, 'unused-t0105-staff-hash', $4, $5, true, NOW(), NOW())`,
      [staffUserId, seed.organizationId, `staff-t0105-${staffUserId}@example.com`, staffFirstName, staffLastName],
    );
  }, 180000);

  afterAll(async () => {
    // Bound app.close(): kafkajs teardown can hang and report a fake failure.
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  type Kind = {
    /** Test-id label. */
    label: string;
    /** Controller base path, e.g. "/cash-receipts". */
    path: string;
    /** Underlying table, for the cross-organisation fixture. */
    table: string;
    /** Substring the slugified title must contain — "thu" or "chi". */
    typeWord: 'thu' | 'chi';
    /** Whether the title carries "(tiền gửi)" — true for the two bank kinds. */
    isDeposit: boolean;
    body: () => Record<string, unknown>;
  };

  const kinds = (): Kind[] => [
    {
      label: 'cash receipt',
      path: '/cash-receipts',
      table: 'cash_receipts',
      typeWord: 'thu',
      isDeposit: false,
      body: () => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 100000,
        lines: [{ description: 'Thu khác', amount: 100000 }],
        partnerType: 'OTHER',
        partnerName: 'Nguyễn Văn A',
      }),
    },
    {
      label: 'cash payment',
      path: '/cash-payments',
      table: 'cash_payments',
      typeWord: 'chi',
      isDeposit: false,
      body: () => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 50000,
        lines: [{ description: 'Chi khác', amount: 50000 }],
        partnerType: 'OTHER',
        partnerName: 'Nguyễn Văn B',
      }),
    },
    {
      label: 'bank receipt',
      path: '/bank-receipts',
      table: 'bank_receipts',
      typeWord: 'thu',
      isDeposit: true,
      body: () => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 200000,
        lines: [{ description: 'Thu khác', amount: 200000 }],
        partnerType: 'OTHER',
        partnerName: 'Nguyễn Văn C',
      }),
    },
    {
      label: 'bank payment',
      path: '/bank-payments',
      table: 'bank_payments',
      typeWord: 'chi',
      isDeposit: true,
      body: () => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 80000,
        lines: [{ description: 'Chi khác', amount: 80000 }],
        partnerType: 'OTHER',
        partnerName: 'Nguyễn Văn D',
      }),
    },
  ];

  describe.each(kinds())('$label export (AC-14, AC-15)', (kind) => {
    it('GET :id/export -> 200, xlsx content-type, non-empty binary body, per-kind filename', async () => {
      const payload = kind.body();
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(payload)
        .expect(201);

      const docNo: string = created.body.documentNumber;
      expect(typeof docNo).toBe('string');
      expect(docNo.length).toBeGreaterThan(0);

      const res = await request(app.getHttpServer())
        .get(`${kind.path}/${created.body.id}/export`)
        .set(headers())
        .responseType('blob')
        .expect(200);

      // Real binary xlsx, not a JSON error body wearing a 200.
      expect(res.headers['content-type']).toContain(XLSX_CONTENT_TYPE);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).length).toBeGreaterThan(0);

      // The file actually parses as a workbook with content — proves the
      // bytes are a real xlsx, not a truncated or corrupt stream.
      const workbook = await readWorkbook(res.body as Buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      expect(workbook.worksheets[0].rowCount).toBeGreaterThan(0);

      // The totals row lands under the right column with the right value —
      // this is the exact row a merge-after-commit bug would have corrupted
      // or thrown on, so a passing read here is not incidental.
      expect(totalsAmountOf(workbook.worksheets[0])).toBe(payload.totalAmount);

      // Content-Disposition carries a real filename: not empty, not the
      // frontend's generic fallback ("chung-tu.xlsx"), and distinct per kind.
      const filename = filenameFrom(res.headers['content-disposition']);
      expect(filename).not.toBe('');
      expect(filename).not.toBe('chung-tu.xlsx');
      expect(filename.toLowerCase().endsWith('.xlsx')).toBe(true);

      const slug = filename.toLowerCase();
      expect(slug).toContain(`phieu-${kind.typeWord}`);
      expect(slug.includes('gui')).toBe(kind.isDeposit);
      // The real document number the voucher was created with, not a
      // hardcoded example — this is the runtime fact the unit test on
      // `toFileSlug` in isolation could not confirm.
      expect(slug).toContain(docNo.toLowerCase());
    });
  });

  describe.each(kinds())('$label export — not found (AC-16)', (kind) => {
    it('a random, non-existent id -> 404 with a JSON error body, not bytes', async () => {
      const res = await request(app.getHttpServer())
        .get(`${kind.path}/${randomUUID()}/export`)
        .set(headers())
        .expect(404);

      // The response must never have been opened as a file: JSON content
      // type, a plain parsed body, not a Buffer of xlsx bytes.
      expect(res.headers['content-type']).toContain('application/json');
      expect(Buffer.isBuffer(res.body)).toBe(false);
      expect(typeof res.body.message).toBe('string');
    });
  });

  describe('cross-organisation ids (AC-16)', () => {
    it.each([
      { label: 'cash receipt', path: '/cash-receipts', table: 'cash_receipts', body: () => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 10000,
        lines: [{ description: 'Thu khác', amount: 10000 }],
        partnerType: 'OTHER',
        partnerName: 'Đối tượng org khác',
      }) },
      { label: 'bank payment', path: '/bank-payments', table: 'bank_payments', body: () => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 10000,
        lines: [{ description: 'Chi khác', amount: 10000 }],
        partnerType: 'OTHER',
        partnerName: 'Đối tượng org khác',
      }) },
    ])(
      '$label belonging to another organisation -> 404, never a 200 with a file',
      async ({ path, table, body }) => {
        const created = await request(app.getHttpServer())
          .post(path)
          .set(headers())
          .send(body())
          .expect(201);

        // `cash_receipts.organization_id` / `bank_payments.organization_id`
        // carry no FK, so a made-up uuid is enough — no second organisation
        // needed to prove the scoping (2026090701's recorded trap).
        await ds.query(`UPDATE ${table} SET organization_id = $1 WHERE id = $2`, [
          randomUUID(),
          created.body.id,
        ]);

        const res = await request(app.getHttpServer())
          .get(`${path}/${created.body.id}/export`)
          .set(headers())
          .expect(404);

        expect(res.headers['content-type']).toContain('application/json');
        expect(Buffer.isBuffer(res.body)).toBe(false);
        expect(typeof res.body.message).toBe('string');
      },
    );
  });

  /**
   * T-01-05 (AC-01, AC-02, AC-03, AC-05, AC-06, AC-08): locks the wiring
   * T-01-01…T-01-04 only unit-tested in isolation — the staff line and first
   * signature really travel through `getPrintPayload` and the xlsx writer for
   * all 4 kinds, over the real HTTP route, against a real second user in
   * `erp_test`.
   */
  const staffFieldOf = (kind: Kind): 'staffId' | 'collectedBy' | 'paidBy' =>
    kind.table === 'bank_receipts'
      ? 'collectedBy'
      : kind.table === 'bank_payments'
        ? 'paidBy'
        : 'staffId';

  const staffLabelOf = (kind: Kind): string =>
    kind.typeWord === 'thu' ? 'Nhân viên thu' : 'Nhân viên chi';

  describe.each(kinds())(
    '$label with a Nhân viên thu/chi (AC-01, AC-02, AC-03, AC-05)',
    (kind) => {
      it('info has the staff line right before "Lý do", no fund/account line; signatures[0] is the staff label + name', async () => {
        const staffLabel = staffLabelOf(kind);
        const body: Record<string, unknown> = {
          ...kind.body(),
          reason: 'Kiểm tra nhân viên thu chi',
          [staffFieldOf(kind)]: staffUserId,
        };
        if (kind.isDeposit && kind.typeWord === 'thu') {
          // AC-03: "Tham chiếu" must survive alongside the new staff line.
          body.reference = 'FT2609';
        }

        const created = await request(app.getHttpServer())
          .post(kind.path)
          .set(headers())
          .send(body)
          .expect(201);

        const res = await request(app.getHttpServer())
          .get(`${kind.path}/${created.body.id}/print-payload`)
          .set(headers())
          .expect(200);

        const info: Array<{ label: string; value: string }> = res.body.info;
        const staffIndex = info.findIndex((row) => row.label === staffLabel);
        const reasonIndex = info.findIndex((row) => row.label === 'Lý do');

        // AC-01/AC-02/AC-03: the staff line exists, carries the resolved
        // name, and sits right before "Lý do"; the fund/account line is gone.
        expect(staffIndex).toBeGreaterThanOrEqual(0);
        expect(info[staffIndex].value).toBe(STAFF_NAME);
        expect(reasonIndex).toBe(staffIndex + 1);
        expect(info.some((row) => row.label === 'Quỹ tiền mặt')).toBe(false);
        expect(info.some((row) => row.label === 'Tài khoản ngân hàng')).toBe(false);
        if (kind.isDeposit && kind.typeWord === 'thu') {
          expect(
            info.some((row) => row.label === 'Tham chiếu' && row.value === 'FT2609'),
          ).toBe(true);
        }

        // AC-05: first signature column is labelled "Nhân viên thu/chi" (never
        // "Người lập phiếu"). A-17/ADR-08: no name is printed under any
        // signature column, so the payload carries no `signatureNames` key at
        // all.
        expect(res.body.signatures[0]).toBe(staffLabel);
        expect(res.body.signatures).not.toContain('Người lập phiếu');
        expect(res.body).not.toHaveProperty('signatureNames');
      });
    },
  );

  describe('print-payload — voucher without a staff member (AC-06)', () => {
    it('cash payment with no Nhân viên chi -> no staff row in info, no signatureNames key, creator name nowhere in the payload', async () => {
      const kind = kinds().find((k) => k.table === 'cash_payments')!;
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.body())
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`${kind.path}/${created.body.id}/print-payload`)
        .set(headers())
        .expect(200);

      const info: Array<{ label: string; value: string }> = res.body.info;
      expect(info.some((row) => row.label === 'Nhân viên chi')).toBe(false);
      expect(res.body.signatures[0]).toBe('Nhân viên chi');
      // A-17/ADR-08: the creator's name is never looked up or printed, so it
      // cannot appear anywhere in the payload — not as a fallback name, not
      // under any other key.
      expect(res.body).not.toHaveProperty('signatureNames');
      expect(JSON.stringify(res.body)).not.toContain(CREATOR_NAME);
    });
  });

  describe('export xlsx — staff line and signature label, no name under any signature (AC-08)', () => {
    it('cash payment export: "Nhân viên chi" info line + signature label, staff name appears exactly once, sheet ends at "(Ký, họ tên)"', async () => {
      const kind = kinds().find((k) => k.table === 'cash_payments')!;
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send({ ...kind.body(), reason: 'Kiểm tra xuất khẩu', staffId: staffUserId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`${kind.path}/${created.body.id}/export`)
        .set(headers())
        .responseType('blob')
        .expect(200);

      const sheet = (await readWorkbook(res.body as Buffer)).worksheets[0];

      // Every non-empty string cell, skipping the satellite cells of a merged
      // range (`type === ValueType.Merge`) — exceljs echoes the master cell's
      // value on every cell the merge covers, so counting those in too made
      // one written name look like it appeared in every column of its row.
      // That misread is what the first version of this test hit.
      const cells: Array<{ row: number; col: number; value: string }> = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = row.getCell(c);
          if (cell.type === ExcelJS.ValueType.Merge) continue;
          const value = cell.value;
          if (typeof value === 'string' && value.length > 0) {
            cells.push({ row: r, col: c, value });
          }
        }
      }

      // AC-08: the info block carries the staff line; no fund/account line,
      // no "Người lập phiếu" anywhere in the sheet.
      expect(cells.some((cell) => cell.value === `Nhân viên chi: ${STAFF_NAME}`)).toBe(true);
      expect(cells.some((cell) => cell.value.includes('Quỹ tiền mặt'))).toBe(false);
      expect(cells.some((cell) => cell.value === 'Người lập phiếu')).toBe(false);

      // The signature block's own label cell reads exactly "Nhân viên chi" —
      // distinct from the "Nhân viên chi: <name>" banner line above — and it
      // is the first (leftmost) content in its row, i.e. the signature row
      // starts with it.
      const labelRowNumber = cells.find((cell) => cell.value === 'Nhân viên chi')?.row;
      expect(labelRowNumber).toBeGreaterThan(0);
      const firstCellOfLabelRow = cells
        .filter((cell) => cell.row === labelRowNumber)
        .sort((a, b) => a.col - b.col)[0];
      expect(firstCellOfLabelRow.value).toBe('Nhân viên chi');

      // A-17/ADR-08: no name is printed under any signature — the staff name
      // appears exactly once in the whole sheet, in the info line above.
      expect(cells.filter((cell) => cell.value.includes(STAFF_NAME)).length).toBe(1);

      // The sheet ends at the "(Ký, họ tên)" hint row — no name row, no blank
      // gap rows below it (the writer is back to `main`, per ADR-08).
      const lastRow = Math.max(...cells.map((cell) => cell.row));
      const lastRowValues = cells
        .filter((cell) => cell.row === lastRow)
        .map((cell) => cell.value);
      expect(lastRowValues.length).toBeGreaterThan(0);
      expect(lastRowValues.every((value) => value === '(Ký, họ tên)')).toBe(true);
    });
  });
});
