import { NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { DeleteInventoryReportTemplateHandler } from './delete-inventory-report-template.handler';
import { DeleteInventoryReportTemplateCommand } from './delete-inventory-report-template.command';

const HCM = 'c3bf1922';
const STOCK = 'inventory-stock-summary';

const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: HCM,
  roles: [],
} as any;

function makeRegistry(): any {
  return {
    list: jest.fn(() => [STOCK]),
    get: jest.fn((key: string) => (key === STOCK ? {} : undefined)),
  };
}

function row(id: string, branchId: string | null): any {
  return {
    id,
    organizationId: 'org-1',
    branchId: branchId ?? undefined,
    reportType: STOCK,
    name: 'Mặc định',
  };
}

function makeRepo(found: any): any {
  return {
    findOne: jest.fn(async () => found),
    softRemove: jest.fn(async (x) => x),
  };
}

function run(found: any, scope?: 'chain' | 'branch') {
  const repo = makeRepo(found);
  const handler = new DeleteInventoryReportTemplateHandler(
    repo,
    makeRegistry(),
  );
  return {
    repo,
    result: handler.execute(
      new DeleteInventoryReportTemplateCommand('t-1', actor, scope),
    ),
  };
}

describe('DeleteInventoryReportTemplateHandler scoping', () => {
  it('matches the branch tier exactly, never crossing into the chain tier', async () => {
    const { repo, result } = run(row('hcm-1', HCM), 'branch');
    await result;
    const where = repo.findOne.mock.calls[0][0].where;
    // A single object, not the two-element OR the read path uses — reusing the
    // read predicate here would let a branch delete the chain default.
    expect(Array.isArray(where)).toBe(false);
    expect(where).toMatchObject({ organizationId: 'org-1', branchId: HCM });
  });

  it('404s without deleting when the predicate excludes the row', async () => {
    // Covers both out-of-scope cases — the chain template seen from a branch,
    // and another branch's row. The predicate in the test above is what proves
    // they are excluded; this one pins the resulting behaviour.
    const { repo, result } = run(null, 'branch');
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.softRemove).not.toHaveBeenCalled();
  });

  it('deletes the chain template in the chain scope, matched with IsNull()', async () => {
    const { repo, result } = run(row('chain-1', null), 'chain');
    await expect(result).resolves.toEqual({ id: 't-1' });
    expect(repo.findOne.mock.calls[0][0].where.branchId).toBeInstanceOf(
      FindOperator,
    );
    expect(repo.softRemove).toHaveBeenCalledTimes(1);
  });

  it('404s on a report type outside the inventory registry', async () => {
    const foreign = row('inv-1', HCM);
    foreign.reportType = 'daily-sales-summary';
    const { repo, result } = run(foreign, 'branch');
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.softRemove).not.toHaveBeenCalled();
  });
});
