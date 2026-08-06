import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, resetDatabase, seedBaseData, authHeader, SeedResult } from './test-app';
import { CoaSeederService } from '../../../src/modules/accounting/seeders/coa-seeder.service';
import { DefaultAccountSeederService } from '../../../src/modules/accounting/seeders/default-account.seeder';

/**
 * Deliberately named without the `.e2e-spec.ts` suffix jest's `testRegex`
 * matches — `describe`/`it` are global functions, so importing a file that
 * matches the pattern would register its top-level suites a second time in
 * whatever file imports it. Pure helpers live here so T-02-08/T-02-09 (and
 * whatever comes after) can import them without side effects.
 */

/**
 * Counts rows across every table the checkout saga can write, so a dry-run
 * (or a deliberately failed transactional run) can be proven to have left the
 * database exactly as it found it — the epic's "Success signal" (00-intent.md).
 */
export async function countBusinessRows(
  ds: DataSource,
): Promise<Record<string, number>> {
  const tables = [
    'invoices',
    'invoice_payments',
    'invoice_debts',
    'stock_ledger_entries',
    'journal_entries',
    'cash_movements',
    'outbox_messages',
    'checkout_saga',
  ];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const rows = await ds.query(`SELECT count(*)::int AS c FROM "${table}"`);
    counts[table] = rows[0].c;
  }
  return counts;
}

export interface CheckoutSagaFixture {
  app: INestApplication;
  ds: DataSource;
  seed: SeedResult;
  itemId: string;
  itemId2: string;
  itemId3: string;
  locationId: string;
  customerId: string;
  headers: () => Record<string, string>;
}

/**
 * Shared fixture for the checkout-saga e2e suite: org/branch/user (via
 * seedBaseData), full COA + default REVENUE/RECEIVABLE roles, a branch cash
 * fund, 3 stocked items with one location, and one customer. Reused from
 * UOW-02 onward — do not re-seed this in later spec files.
 */
export async function buildCheckoutSagaFixture(): Promise<CheckoutSagaFixture> {
  const app = await createTestApp();
  await resetDatabase(app);
  const seed = await seedBaseData(app);
  const ds = app.get(DataSource);

  await app
    .get(CoaSeederService)
    .seedForOrganization(seed.organizationId, seed.userId);
  await app
    .get(DefaultAccountSeederService)
    .seedForOrganization(seed.organizationId, seed.userId);

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const cashGl = await ds.query(
    `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
    [seed.organizationId],
  );
  await request(app.getHttpServer())
    .post('/cash/accounts')
    .set(headers())
    .send({
      name: 'Quỹ E2E Checkout',
      type: 'REGISTER',
      accountId: cashGl[0].id,
      balance: 0,
    })
    .expect(201);

  // The cash fund above is the *till* (cash_accounts); AccountResolverService
  // separately needs a payment_accounts config row mapping the `cash` method
  // to a COA account before it will resolve a payment line at all.
  await ds.query(
    `INSERT INTO payment_accounts
       (id, organization_id, branch_id, payment_method, account_id, is_active, sort_order, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, NULL, 'cash', $2, true, 0, $3, NOW(), NOW())`,
    [seed.organizationId, cashGl[0].id, seed.userId],
  );

  const storageRes = await request(app.getHttpServer())
    .post('/inventory/storages')
    .set(headers())
    .send({ name: 'Checkout WH', branchId: seed.branchId })
    .expect(201);

  const locRes = await request(app.getHttpServer())
    .post('/inventory/locations')
    .set(headers())
    .send({
      code: 'CKO-LOC',
      type: 'SHELF',
      name: 'Checkout Loc',
      storageId: storageRes.body.id,
      branchId: seed.branchId,
    })
    .expect(201);
  const locationId = locRes.body.id;

  const createItem = async (code: string, sellingPrice: number) => {
    const res = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code,
        name: `Item ${code}`,
        unit: 'PCS',
        purchasePrice: Math.round(sellingPrice * 0.6),
        sellingPrice,
      })
      .expect(201);
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, $5, NOW(), NOW())`,
      [seed.organizationId, seed.branchId, res.body.id, locationId, seed.userId],
    );
    return res.body.id as string;
  };
  const itemId = await createItem('CKO-ITEM-1', 100000);
  const itemId2 = await createItem('CKO-ITEM-2', 200000);
  const itemId3 = await createItem('CKO-ITEM-3', 685000);

  const customerRes = await request(app.getHttpServer())
    .post('/customers')
    .set(headers())
    .send({ name: 'Checkout Test Customer' })
    .expect(201);
  const customerId = customerRes.body.id;

  return {
    app,
    ds,
    seed,
    itemId,
    itemId2,
    itemId3,
    locationId,
    customerId,
    headers,
  };
}
