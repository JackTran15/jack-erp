import { RevenueNotificationDefinition } from './revenue.definition';
import { StockAlertNotificationDefinition } from './stock-alert.definition';

const ORG = '10000000-0000-4000-8000-000000000001';
const B1 = '20000000-0000-4000-8000-000000000001';
const B2 = '20000000-0000-4000-8000-000000000002';
const B3 = '20000000-0000-4000-8000-000000000003';
/** 09:00 on 2026-09-22 business time → reports 2026-09-21. */
const NOW = new Date('2026-09-22T02:00:00Z');

describe('RevenueNotificationDefinition', () => {
  function setup() {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.includes('SELECT DISTINCT b."organization_id"')) return [{ org: ORG, name: 'Chuỗi Demo' }];
        if (sql.includes('FROM "branches" WHERE')) {
          return [
            { id: B1, name: 'Q1' },
            { id: B2, name: 'Q2' },
            { id: B3, name: 'Cần Thơ' },
          ];
        }
        if (sql.includes('FROM lines l')) {
          return [
            { id: B1, invoiceCount: 3, revenue: 1000000 },
            { id: B2, invoiceCount: 1, revenue: 250000.5 },
          ];
        }
        return [];
      }),
    };
    const resolver = {
      assignedBranches: jest.fn().mockResolvedValue(
        new Map([
          ['owner', [B1, B2, B3]],
          ['q2-manager', [B2]],
          ['ct-manager', [B3]],
        ]),
      ),
    };
    return { definition: new RevenueNotificationDefinition(dataSource as any, resolver as any), queries };
  }

  it('reports YESTERDAY with the Overview screen SQL, same params shape', async () => {
    const { definition, queries } = setup();
    await definition.collect(NOW);

    const revenue = queries.find((q) => q.sql.includes('FROM lines l'))!;
    expect(revenue.params).toEqual([ORG, '2026-09-21', '2026-09-21', [B1, B2, B3]]);
  });

  it('one branchOnly firing per store that sold, one chainOnly firing per user over THEIR stores', async () => {
    const { definition } = setup();
    const contexts = await definition.collect(NOW);

    const branch = contexts.filter((c) => c.scope === 'branchOnly');
    expect(branch.map((c) => [c.branchId, c.payload.amount, c.payload.storeName])).toEqual([
      [B1, 1000000, 'Q1'],
      [B2, 250000.5, 'Q2'],
    ]);

    const chain = contexts.filter((c) => c.scope === 'chainOnly');
    expect(chain.map((c) => [c.recipientUserIds, c.payload.amount])).toEqual([
      [['owner'], 1250000.5],
      // Only Q2 — never the organization total: no leak of stores the user cannot open.
      [['q2-manager'], 250000.5],
      // ct-manager: their only store sold nothing → no push.
    ]);
    expect(chain[0].branchId).toBeUndefined();
    expect(chain[0].payload.storeName).toBe('Chuỗi Demo');
  });

  it('rerunning the same day yields the same event ids (no double push)', async () => {
    const first = (await setup().definition.collect(NOW)).map((c) => c.eventId);
    const second = (await setup().definition.collect(NOW)).map((c) => c.eventId);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('builds store / overview targets', async () => {
    const { definition } = setup();
    const [branch, , chain] = await definition.collect(NOW);
    expect(await definition.build(branch)).toEqual({
      data: { date: '2026-09-21', amount: 1000000, store: 'Q1' },
      target: { type: 'store', id: B1 },
    });
    expect((await definition.build(chain)).target).toEqual({ type: 'overview' });
  });
});

describe('StockAlertNotificationDefinition', () => {
  it('one firing per store, naming the first product and counting the others', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        { org: ORG, branch: B1, store: 'Q1', count: 3, first_product: 'Adidas' },
        { org: ORG, branch: B3, store: 'Cần Thơ', count: 1, first_product: 'Vascara' },
      ]),
    };
    const definition = new StockAlertNotificationDefinition(dataSource as any);

    const contexts = await definition.collect(NOW);

    expect(contexts.map((c) => [c.branchId, c.payload.productName, c.payload.more])).toEqual([
      [B1, 'Adidas', 2],
      [B3, 'Vascara', 0],
    ]);
    expect(contexts[0].scope).toBeUndefined();
    expect(await definition.build(contexts[0])).toEqual({
      data: { product: 'Adidas', more: 2, store: 'Q1' },
      target: { type: 'inventory_store', id: B1 },
    });
  });
});
