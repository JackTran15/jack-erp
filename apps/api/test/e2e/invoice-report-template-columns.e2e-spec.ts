import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';
import { ReportTypeSyncService } from '../../src/modules/reporting/invoice-report/report-type-sync.service';

/**
 * E2E for report-template column config (EPIC-15062026). Templates persist
 * per-column records `{ col, displayName, visible, frozen, order }`. Exercises
 * the HTTP round-trip create → get → update → list, server-stamped order, and
 * catalog validation done PER reportType (the daily-sales catalog rejects a
 * line-item column, while the same key is accepted for the item-revenue report).
 */
describe('Invoice report template columns (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let templateId: string;

  const DAILY = 'daily-sales-summary';
  const ITEM_REVENUE = 'invoice-item-revenue-detail';

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    // resetDatabase wipes report_types seeded at boot — repopulate via the real sync path.
    await app.get(ReportTypeSyncService).onApplicationBootstrap();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a template, stamping order from array position and trimming displayName', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/templates')
      .set(headers())
      .send({
        reportType: DAILY,
        name: 'Layout A',
        columns: [
          { col: 'date', visible: true, frozen: true, order: 9 },
          { col: 'revenue.total', displayName: '  Total  ', visible: true, frozen: false },
          { col: 'revenue.goods', visible: false, frozen: false },
        ],
        filters: { issuedAt: { from: '2026-06-01' } },
      })
      .expect(201);

    expect(res.body.columns).toEqual([
      { col: 'date', displayName: null, visible: true, frozen: true, order: 0 },
      { col: 'revenue.total', displayName: 'Total', visible: true, frozen: false, order: 1 },
      { col: 'revenue.goods', displayName: null, visible: false, frozen: false, order: 2 },
    ]);
    templateId = res.body.id;
  });

  it('returns the stored records on GET by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/invoices/templates/${templateId}`)
      .set(headers())
      .expect(200);
    expect(res.body.columns.map((c: any) => c.col)).toEqual([
      'date',
      'revenue.total',
      'revenue.goods',
    ]);
    expect(res.body.columns[1]).toMatchObject({ displayName: 'Total', order: 1 });
  });

  it('full-replaces columns on PATCH, re-stamping order', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/reports/invoices/templates/${templateId}`)
      .set(headers())
      .send({
        columns: [
          { col: 'revenue.total', displayName: 'Sum', visible: true, frozen: false, order: 5 },
          { col: 'date', visible: true, frozen: true },
        ],
      })
      .expect(200);
    expect(res.body.columns).toEqual([
      { col: 'revenue.total', displayName: 'Sum', visible: true, frozen: false, order: 0 },
      { col: 'date', displayName: null, visible: true, frozen: true, order: 1 },
    ]);
  });

  it('lists templates for the report type', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/invoices/templates?reportType=${DAILY}`)
      .set(headers())
      .expect(200);
    const found = res.body.find((t: any) => t.id === templateId);
    expect(found).toBeDefined();
    expect(found.columns).toHaveLength(2);
  });

  it('rejects a column outside the report-type catalog (per-reportType validation)', async () => {
    // `sku` belongs to the item-revenue report, not daily-sales-summary.
    await request(app.getHttpServer())
      .post('/reports/invoices/templates')
      .set(headers())
      .send({
        reportType: DAILY,
        name: 'Bad columns',
        columns: [{ col: 'sku', visible: true, frozen: false }],
      })
      .expect(400);
  });

  it('accepts that same column for the report type whose catalog includes it (generic)', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/templates')
      .set(headers())
      .send({
        reportType: ITEM_REVENUE,
        name: 'Item layout',
        columns: [
          { col: 'sku', visible: true, frozen: true },
          { col: 'quantity', visible: true, frozen: false },
        ],
      })
      .expect(201);
    expect(res.body.columns.map((c: any) => c.col)).toEqual(['sku', 'quantity']);
  });

  it('rejects a template with no visible column', async () => {
    await request(app.getHttpServer())
      .post('/reports/invoices/templates')
      .set(headers())
      .send({
        reportType: DAILY,
        name: 'All hidden',
        columns: [{ col: 'date', visible: false, frozen: false }],
      })
      .expect(400);
  });
});
