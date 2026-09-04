import { INVENTORY_VALUE_PERMISSION } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../rbac/rbac.service';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { GetInventoryReportColumnsHandler } from './get-inventory-report-columns.handler';
import { GetInventoryReportColumnsQuery } from './get-inventory-report-columns.query';
import { SearchInventoryReportHandler } from './search-inventory-report.handler';
import { SearchInventoryReportQuery } from './search-inventory-report.query';
import { GetInventoryReportDocumentHandler } from './get-inventory-report-document.handler';
import { GetInventoryReportDocumentQuery } from './get-inventory-report-document.query';

const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'b1',
  branchIds: ['b1'],
  roles: [],
} as unknown as ActorContext;

const CATALOG = [
  { col: 'sku' },
  { col: 'openingQty' },
  { col: 'openingValue' },
  { col: 'outQty' },
  { col: 'outValue' },
];

function definition() {
  return {
    key: 'inventory-stock-summary',
    valueColumns: ['openingValue', 'outValue'],
    buildColumns: jest.fn(async () => CATALOG),
    buildData: jest.fn(async () => ({ rows: [], totals: null, total: 0 })),
  };
}

function registryOf(def: unknown): InventoryReportRegistry {
  return { get: () => def } as unknown as InventoryReportRegistry;
}

function rbacGranting(granted: boolean): RbacService {
  return {
    hasPermission: jest.fn(async (_u: string, _o: string, key: string) =>
      key === INVENTORY_VALUE_PERMISSION ? granted : false,
    ),
  } as unknown as RbacService;
}

/** Cache that always misses, so the factory runs and we can read what it got. */
const passthroughCache = {
  getOrSet: jest.fn(
    async (_ns: string, _key: string, factory: () => Promise<unknown>) =>
      factory(),
  ),
} as never;

describe('inventory value columns are gated by reporting.inventory.value.read', () => {
  it('drops them from the column catalog without the permission', async () => {
    const def = definition();
    const handler = new GetInventoryReportColumnsHandler(
      registryOf(def),
      rbacGranting(false),
    );

    const result = await handler.execute(
      new GetInventoryReportColumnsQuery('inventory-stock-summary', actor, {}),
    );

    expect(result.columns.map((c) => c.col)).toEqual([
      'sku',
      'openingQty',
      'outQty',
    ]);
  });

  it('keeps them with the permission', async () => {
    const def = definition();
    const handler = new GetInventoryReportColumnsHandler(
      registryOf(def),
      rbacGranting(true),
    );

    const result = await handler.execute(
      new GetInventoryReportColumnsQuery('inventory-stock-summary', actor, {}),
    );

    expect(result.columns.map((c) => c.col)).toContain('openingValue');
  });

  it('silently drops a saved template that still asks for one, instead of 400ing', async () => {
    // assertKnownColumns would reject an unknown column; a forbidden one has to
    // behave differently, or every user who saved a template before losing the
    // permission would get an error instead of a report.
    const def = definition();
    const handler = new SearchInventoryReportHandler(
      registryOf(def),
      passthroughCache,
      rbacGranting(false),
    );

    await handler.execute(
      new SearchInventoryReportQuery(
        {
          reportType: 'inventory-stock-summary',
          columns: ['sku', 'openingValue', 'outQty'],
          filters: {},
        } as never,
        actor,
      ),
    );

    expect(def.buildData).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ['sku', 'outQty'] }),
      actor,
    );
  });

  it('holds on the export path too', async () => {
    const def = definition();
    const exportService = {
      prepareExport: jest.fn(async () => ({}) as never),
    } as never;
    const handler = new GetInventoryReportDocumentHandler(
      registryOf(def),
      exportService,
      rbacGranting(false),
    );

    await handler.execute(
      new GetInventoryReportDocumentQuery(
        {
          reportType: 'inventory-stock-summary',
          columns: ['sku', 'outValue'],
          filters: {},
        } as never,
        actor,
      ),
    );

    expect(
      (exportService as unknown as { prepareExport: jest.Mock }).prepareExport,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ columns: ['sku'] }),
      actor,
      expect.anything(),
    );
  });

  it('leaves a quantity-only report untouched', async () => {
    const def = { ...definition(), valueColumns: undefined };
    const handler = new GetInventoryReportColumnsHandler(
      registryOf(def),
      rbacGranting(false),
    );

    const result = await handler.execute(
      new GetInventoryReportColumnsQuery('inventory-stock-by-store-pivot', actor, {}),
    );

    expect(result.columns).toHaveLength(CATALOG.length);
  });
});
