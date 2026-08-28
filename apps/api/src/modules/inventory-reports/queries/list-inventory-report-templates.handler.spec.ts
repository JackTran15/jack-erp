import { FindOperator } from 'typeorm';
import { ListInventoryReportTemplatesHandler } from './list-inventory-report-templates.handler';
import { ListInventoryReportTemplatesQuery } from './list-inventory-report-templates.query';

const HCM = 'c3bf1922';
const HN = '09743ddb';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: HCM,
  roles: [],
} as any;

const STOCK = 'inventory-stock-summary';

/** Registry that recognises inventory report keys only. */
function makeRegistry(): any {
  return {
    list: jest.fn(() => [STOCK]),
    get: jest.fn((key: string) => (key === STOCK ? {} : undefined)),
  };
}

function row(id: string, branchId: string | null, reportType = STOCK): any {
  return {
    id,
    organizationId: 'org-1',
    branchId: branchId ?? undefined,
    reportType,
    name: 'Mặc định',
    columns: [],
    filters: {},
    sortOrder: 0,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

function makeRepo(rows: any[]): any {
  return { find: jest.fn(async () => rows) };
}

function run(rows: any[], scope?: 'chain' | 'branch') {
  const repo = makeRepo(rows);
  const handler = new ListInventoryReportTemplatesHandler(
    repo,
    makeRegistry(),
  );
  return {
    repo,
    result: handler.execute(
      new ListInventoryReportTemplatesQuery(actor, STOCK, scope),
    ),
  };
}

describe('ListInventoryReportTemplatesHandler scoping', () => {
  it('falls back to the chain template when the branch has none', async () => {
    const { result } = run([row('chain-1', null)], 'branch');
    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: 'chain-1', scope: 'chain', branchId: null }),
    ]);
  });

  it('returns the branch template and drops the chain row it shadows', async () => {
    const { result } = run([row('hcm-1', HCM), row('chain-1', null)], 'branch');
    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: 'hcm-1', scope: 'branch', branchId: HCM }),
    ]);
  });

  it('never returns another branch template', async () => {
    const { result } = run([row('hn-1', HN)], 'branch');
    await expect(result).resolves.toEqual([]);
  });

  it('returns chain rows only in the chain scope', async () => {
    const { result } = run([row('hcm-1', HCM), row('chain-1', null)], 'chain');
    await expect(result).resolves.toEqual([
      expect.objectContaining({ id: 'chain-1', scope: 'chain' }),
    ]);
  });

  it('reads both tiers in a single query', async () => {
    const { repo, result } = run([row('chain-1', null)], 'branch');
    await result;
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('spreads the report-type filter into every scope branch of the OR', async () => {
    const { repo, result } = run([row('chain-1', null)], 'branch');
    await result;
    const where = repo.find.mock.calls[0][0].where;
    expect(where).toHaveLength(2);
    // Both tiers carry the filter; hanging it off the array would leave the
    // chain tier unfiltered and leak invoice templates onto inventory routes.
    expect(where.every((w: any) => w.reportType === STOCK)).toBe(true);
    expect(where[0].branchId).toBe(HCM);
    expect(where[1].branchId).toBeInstanceOf(FindOperator);
  });

  it('still filters out report types outside the inventory registry', async () => {
    const { result } = run([row('chain-1', null, 'daily-sales-summary')], 'branch');
    await expect(result).resolves.toEqual([]);
  });
});
