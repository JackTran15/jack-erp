import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as ExcelJS from 'exceljs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';
import { InvoiceOrderListingReport } from '../../src/modules/reporting/invoice-report/reports/invoice-order-listing.report';

/**
 * E2E for the shared report export path (`POST /reports/<domain>/export`).
 *
 * The point of this suite is ADR-03: the exporter calls `buildData` once with a
 * large limit instead of paging, on the assumption that every report domain
 * filters and totals over ALL rows before slicing a page. If that assumption is
 * wrong for any domain, the exported file silently contains one page of data
 * and a totals row that disagrees with it — a bug no unit test with a mocked
 * registry can catch. So this asserts parity against a real `POST search`, on
 * seeded data deliberately larger than one page.
 */
describe('Report export parity (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let locationId: string;
  const itemIds: string[] = [];

  const STOCK_SUMMARY = 'inventory-stock-summary';
  const PERIOD = { period: { from: '2026-07-01', to: '2026-07-31' } };
  /** More rows than one search page, so paging vs whole-set actually differs. */
  const ITEM_COUNT = 25;
  const SEARCH_PAGE_SIZE = 10;

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

  /** Row index of the header band: title block lines + 1. */
  function headerRowNumber(sheet: ExcelJS.Worksheet, firstLabel: string): number {
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (sheet.getRow(r).getCell(1).value === firstLabel) return r;
    }
    throw new Error(`header row starting with "${firstLabel}" not found`);
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'Export Warehouse', branchId: seed.branchId })
      .expect(201);

    const locationRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({
        code: 'E-01',
        name: 'Export Shelf',
        type: 'SHELF',
        storageId: storageRes.body.id,
        branchId: seed.branchId,
      })
      .expect(201);
    locationId = locationRes.body.id;

    for (let i = 0; i < ITEM_COUNT; i++) {
      const code = `EXP-${String(i).padStart(3, '0')}`;
      const item = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          code,
          name: `Export Item ${i}`,
          unit: 'Cái',
          purchasePrice: 100,
          sellingPrice: 200,
          isPosVisible: true,
          isActive: true,
        })
        .expect(201);
      itemIds.push(item.body.id);

      // One receipt inside the period per item: quantity and value vary so the
      // totals row is a real sum rather than a multiple of one number.
      await ds.query(
        `INSERT INTO stock_ledger_entries
           (id, organization_id, branch_id, item_id, location_id, movement_type,
            quantity, reference_type, reference_id, unit_cost, line_value,
            posted_at, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, 'PURCHASE_RECEIPT',
                 $5, 'E2E_EXPORT', gen_random_uuid(), 100, $6,
                 '2026-07-10T00:00:00Z'::timestamptz, $7::uuid, NOW(), NOW())`,
        [
          seed.organizationId,
          seed.branchId,
          item.body.id,
          locationId,
          i + 1,
          (i + 1) * 100,
          seed.userId,
        ],
      );
    }
    // App boot joins kafkajs consumer groups, which can exceed the default hook timeout.
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  }, 300_000);

  it('exports every filtered row, not just the first search page', async () => {
    const body = {
      reportType: STOCK_SUMMARY,
      columns: ['sku', 'name', 'inQty'],
      filters: PERIOD,
    };

    const search = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({ ...body, page: 1, limit: SEARCH_PAGE_SIZE })
      // Search keeps Nest's POST default (201); only export sets @HttpCode(200).
      .expect(201);

    // Guard the guard: if the seed ever stops exceeding one page, this test
    // would pass while proving nothing.
    expect(search.body.total).toBeGreaterThan(SEARCH_PAGE_SIZE);
    expect(search.body.rows).toHaveLength(SEARCH_PAGE_SIZE);

    const exported = await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .responseType('blob')
      .send(body)
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

    const sheet = await readSheet(exported.body);
    const headerRow = headerRowNumber(sheet, 'Mã SKU');
    // Everything below the header is data, except the trailing totals row.
    const dataRowCount = sheet.rowCount - headerRow - 1;

    expect(dataRowCount).toBe(search.body.total);
  });

  it('writes a totals row equal to the totals the search reports', async () => {
    const body = {
      reportType: STOCK_SUMMARY,
      columns: ['sku', 'name', 'inQty'],
      filters: PERIOD,
    };

    const search = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({ ...body, page: 1, limit: SEARCH_PAGE_SIZE })
      // Search keeps Nest's POST default (201); only export sets @HttpCode(200).
      .expect(201);

    const exported = await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .responseType('blob')
      .send(body)
      .expect(200);

    const sheet = await readSheet(exported.body);
    const totalsRow = sheet.getRow(sheet.rowCount);

    // `inQty` is the third requested column.
    expect(Number(totalsRow.getCell(3).value)).toBe(
      Number(search.body.totals.inQty),
    );
    // Totals span all rows, so they must exceed any single page's contribution.
    const pageSum = search.body.rows.reduce(
      (acc: number, row: Record<string, unknown>) => acc + Number(row.inQty ?? 0),
      0,
    );
    expect(Number(totalsRow.getCell(3).value)).toBeGreaterThan(pageSum);
  });

  it('honours the requested column set, order and renamed labels', async () => {
    const exported = await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .responseType('blob')
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['inQty', 'sku'],
        columnLabels: { inQty: 'SL nhập trong kỳ' },
        filters: PERIOD,
      })
      .expect(200);

    const sheet = await readSheet(exported.body);
    const headerRow = headerRowNumber(sheet, 'SL nhập trong kỳ');

    expect(sheet.getRow(headerRow).getCell(1).value).toBe('SL nhập trong kỳ');
    expect(sheet.getRow(headerRow).getCell(2).value).toBe('Mã SKU');
    // Only the two requested columns are emitted.
    expect(sheet.getRow(headerRow).getCell(3).value).toBeFalsy();
  });

  it('rejects an unknown column instead of exporting a partial file', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['sku', 'notAColumn'],
        filters: PERIOD,
      })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('notAColumn');
  });

  it('rejects pagination parameters — export is always the whole set', async () => {
    await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['sku'],
        filters: PERIOD,
        page: 2,
      })
      .expect(400);
  });

  it('rejects an unregistered report type', async () => {
    await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set(headers())
      .send({ reportType: 'not-a-report', columns: ['sku'], filters: PERIOD })
      .expect(400);
  });

  it('exports the invoice domain through the same shared path', async () => {
    const reportType = 'daily-sales-summary';
    const columns = ['date', 'actualRevenue'];
    const filters = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };

    const search = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({ reportType, columns, filters, page: 1, limit: 31 })
      .expect(201);

    const exported = await request(app.getHttpServer())
      .post('/reports/invoices/export')
      .set(headers())
      .responseType('blob')
      .send({ reportType, columns, filters })
      .expect(200)
      .expect(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );

    const sheet = await readSheet(exported.body);
    const headerRow = headerRowNumber(sheet, 'Ngày');
    const totalsRows = search.body.totals ? 1 : 0;

    expect(sheet.rowCount - headerRow - totalsRows).toBe(search.body.total);
  });
});

/**
 * E2E for the keyset export path (ADR-07).
 *
 * `invoice-order-listing` declares `exportSource`, so its export streams by
 * cursor across time windows instead of one `buildData` call. Two things can
 * only be proven against a real database: that the cursor SQL is valid at all
 * (raw `::text` casts, bind counts, alias ordering), and that walking by cursor
 * returns exactly the same rows as the single-shot path — no duplicates, none
 * missing, even when rows share a timestamp or arrive mid-export.
 */
describe('Report export keyset parity (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const LISTING = 'invoice-order-listing';
  const COLUMNS = ['invoiceCode', 'revenue.goods'];
  const FILTERS = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
  /** Deliberately more than one keyset page at the batch size used below. */
  const INVOICE_COUNT = 24;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function readSheet(body: Buffer): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    return workbook.worksheets[0];
  }

  function headerRowNumber(sheet: ExcelJS.Worksheet, firstLabel: string): number {
    for (let r = 1; r <= sheet.rowCount; r++) {
      if (sheet.getRow(r).getCell(1).value === firstLabel) return r;
    }
    throw new Error(`header row starting with "${firstLabel}" not found`);
  }

  /** Invoice codes in the file, top to bottom, excluding the totals row. */
  function codesOf(sheet: ExcelJS.Worksheet): string[] {
    const headerRow = headerRowNumber(sheet, 'Số hóa đơn');
    const codes: string[] = [];
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const value = sheet.getRow(r).getCell(1).value;
      if (typeof value === 'string' && value.startsWith('KS-')) codes.push(value);
    }
    return codes;
  }

  async function insertInvoice(code: string, issuedAt: string, goods: number) {
    await ds.query(
      `INSERT INTO invoices
         (id, organization_id, branch_id, code, status, type, issued_at,
          subtotal, net_amount, amount_due, total_paid, is_draft, session_id,
          staff_id, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'paid', 'SALE', $4::timestamptz,
               $5, $5, $5, $5, false, 'e2e-keyset', $6::uuid, $6, NOW(), NOW())`,
      [seed.organizationId, seed.branchId, code, issuedAt, goods, seed.userId],
    );
  }

  function exportListing() {
    return request(app.getHttpServer())
      .post('/reports/invoices/export')
      .set(headers())
      .responseType('blob')
      .send({ reportType: LISTING, columns: COLUMNS, filters: FILTERS })
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    for (let i = 0; i < INVOICE_COUNT; i++) {
      // Three invoices per timestamp: the id tiebreaker in the cursor is the
      // only thing that can walk past them, which is where OFFSET paging and a
      // date-only cursor both go wrong.
      const day = String(1 + Math.floor(i / 3)).padStart(2, '0');
      await insertInvoice(
        `KS-${String(i).padStart(3, '0')}`,
        `2026-07-${day}T08:00:00Z`,
        (i + 1) * 1000,
      );
    }
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  }, 300_000);

  it('exports every invoice through the cursor path', async () => {
    // Prove the keyset fetcher actually ran: every other assertion in this
    // suite would pass just as happily if the export had quietly fallen back
    // to the single-shot path.
    const report = app.get(InvoiceOrderListingReport);
    const pageSpy = jest.spyOn(report.exportSource, 'page');

    const search = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({ reportType: LISTING, columns: COLUMNS, filters: FILTERS, page: 1, limit: 10 })
      .expect(201);

    expect(search.body.total).toBe(INVOICE_COUNT);

    const sheet = await readSheet((await exportListing()).body);
    const codes = codesOf(sheet);

    expect(codes).toHaveLength(INVOICE_COUNT);
    // No duplicates: a cursor that stalls on tied timestamps repeats a page.
    expect(new Set(codes).size).toBe(INVOICE_COUNT);
    // One call per window at least, and every call carries a real partition.
    expect(pageSpy).toHaveBeenCalled();
    for (const [, , args] of pageSpy.mock.calls) {
      expect(args.partition.from).toBeInstanceOf(Date);
    }
    pageSpy.mockRestore();
  });

  it('matches the single-shot path row for row', async () => {
    // Same report, same filters, both paths — the file must not depend on
    // which fetcher produced it.
    const viaKeyset = codesOf(await readSheet((await exportListing()).body));

    const search = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: LISTING,
        columns: COLUMNS,
        filters: FILTERS,
        page: 1,
        // The invoice search DTO caps limit at 366, not 500.
        limit: 200,
      })
      .expect(201);
    const viaBuildData = search.body.rows.map(
      (r: Record<string, unknown>) => r.invoiceCode as string,
    );

    expect([...viaKeyset].sort()).toEqual([...viaBuildData].sort());
  });

  it('totals over every row, not over one window', async () => {
    const search = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({ reportType: LISTING, columns: COLUMNS, filters: FILTERS, page: 1, limit: 10 })
      .expect(201);

    const sheet = await readSheet((await exportListing()).body);
    const totalsRow = sheet.getRow(sheet.rowCount);

    // Running sums across partitions must land on the same number the
    // single-shot path computes over the whole set.
    expect(Number(totalsRow.getCell(2).value)).toBe(
      Number(search.body.totals['revenue.goods']),
    );
  });

  it('does not repeat or lose rows when an invoice is inserted mid-export', async () => {
    const before = codesOf(await readSheet((await exportListing()).body));

    // Insert while a second export runs. The new row may or may not appear —
    // that is a race either way — but nothing that existed at the start may be
    // duplicated or dropped, which is exactly what OFFSET paging gets wrong.
    const running = exportListing();
    await insertInvoice('KS-NEW', '2026-07-04T09:30:00Z', 999);
    const during = codesOf(await readSheet((await running).body));

    expect(new Set(during).size).toBe(during.length);
    for (const code of before) expect(during).toContain(code);
  });

  it('exports a wide period without hitting the row cap', async () => {
    // The single-shot path caps at MAX_REPORT_ROWS; a cursor-paged report has
    // no cap because it never holds the whole set (AC-18). Proving the absence
    // of a 400 on a real request is the closest this suite can get without
    // seeding 50k invoices.
    await request(app.getHttpServer())
      .post('/reports/invoices/export')
      .set(headers())
      .responseType('blob')
      .send({
        reportType: LISTING,
        columns: COLUMNS,
        filters: { issuedAt: { from: '2020-01-01', to: '2030-12-31' } },
      })
      .expect(200);
  });
});
