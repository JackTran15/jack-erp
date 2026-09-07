import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { UpdateInventoryReportTemplateHandler } from './update-inventory-report-template.handler';
import { UpdateInventoryReportTemplateCommand } from './update-inventory-report-template.command';

const HCM = 'c3bf1922';
const STOCK = 'inventory-stock-summary';
const CATALOG = ['sku', 'name', 'openingQty'];

const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: HCM,
  roles: [],
} as any;

function makeRegistry(): any {
  return {
    list: jest.fn(() => [STOCK]),
    get: jest.fn((key: string) =>
      key === STOCK
        ? {
            buildColumns: jest.fn(async () =>
              CATALOG.map((col) => ({
                col,
                name: col,
                desc: null,
                type: 'number',
                group: null,
              })),
            ),
          }
        : undefined,
    ),
  };
}

function row(id: string, branchId: string | null, name = 'Mặc định'): any {
  return {
    id,
    organizationId: 'org-1',
    branchId: branchId ?? undefined,
    reportType: STOCK,
    name,
    description: null,
    columns: [{ col: 'name', displayName: null, visible: true, frozen: false, order: 0 }],
    filters: { columnFilters: [] },
    sortOrder: 0,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

/**
 * `findOne` answers the lookup first and the duplicate-name check second, which
 * is exactly the order the handler calls them in.
 */
function makeRepo(found: any, dup: any = null): any {
  const findOne = jest
    .fn()
    .mockResolvedValueOnce(found)
    .mockResolvedValue(dup);
  return {
    findOne,
    save: jest.fn(async (x) => ({
      ...x,
      id: x.id ?? 'forked-1',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-02T00:00:00Z'),
    })),
  };
}

const patch = { columns: [{ col: 'sku', visible: true, frozen: false }] };

function cmd(id: string, dto: Record<string, unknown>) {
  return new UpdateInventoryReportTemplateCommand(id, dto as any, actor);
}

describe('UpdateInventoryReportTemplateHandler copy-on-write', () => {
  it('forks a chain template instead of editing it when saving into a branch', async () => {
    const chain = row('chain-1', null);
    const repo = makeRepo(chain);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    const view = await handler.execute(
      cmd('chain-1', { ...patch, scope: 'branch' }),
    );

    const saved = repo.save.mock.calls[0][0];
    // No id ⇒ INSERT. Carrying the chain id here is the whole bug: TypeORM would
    // UPDATE the row every other branch is still inheriting.
    expect(saved.id).toBeUndefined();
    expect(saved.branchId).toBe(HCM);
    expect(saved.columns.map((c: any) => c.col)).toEqual(['sku']);
    expect(view).toMatchObject({ scope: 'branch', branchId: HCM });
  });

  it('leaves the chain row itself untouched while forking', async () => {
    const chain = row('chain-1', null);
    const before = JSON.parse(JSON.stringify(chain.columns));
    const repo = makeRepo(chain);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await handler.execute(cmd('chain-1', { ...patch, scope: 'branch' }));

    expect(chain.columns).toEqual(before);
    expect(chain.name).toBe('Mặc định');
  });

  it('updates in place once the branch owns the row', async () => {
    const own = row('hcm-1', HCM);
    const repo = makeRepo(own);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await handler.execute(cmd('hcm-1', { ...patch, scope: 'branch' }));

    expect(repo.save.mock.calls[0][0].id).toBe('hcm-1');
  });

  it('updates the chain row in place in the chain scope', async () => {
    const chain = row('chain-1', null);
    const repo = makeRepo(chain);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await handler.execute(cmd('chain-1', { ...patch, scope: 'chain' }));

    expect(repo.save.mock.calls[0][0].id).toBe('chain-1');
  });

  it('reads only the chain tier in the chain scope', async () => {
    const repo = makeRepo(row('chain-1', null));
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await handler.execute(cmd('chain-1', { ...patch, scope: 'chain' }));

    const where = repo.findOne.mock.calls[0][0].where;
    expect(where).toHaveLength(1);
    expect(where[0].branchId).toBeInstanceOf(FindOperator);
  });

  it('404s on a row belonging to another branch', async () => {
    const repo = makeRepo(null);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await expect(
      handler.execute(cmd('hn-1', { ...patch, scope: 'branch' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s in the chain scope on an id that belongs to a branch', async () => {
    // Editing the chain default must not be a back door into one branch's row.
    // The chain predicate excludes it, so nothing is found and nothing is saved.
    const repo = makeRepo(null);
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await expect(
      handler.execute(cmd('hcm-1', { ...patch, scope: 'chain' })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('checks the inherited name before forking, so a clash is a 409 not a 23505', async () => {
    // The fork keeps the chain row's name. That name is free in the chain tier
    // but already taken in this branch — without the check it reaches the unique
    // index and surfaces as a raw driver error.
    const repo = makeRepo(row('chain-1', null), { id: 'hcm-existing' });
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await expect(
      handler.execute(cmd('chain-1', { ...patch, scope: 'branch' })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('does not run a duplicate check on an in-place save that keeps its name', async () => {
    const repo = makeRepo(row('hcm-1', HCM));
    const handler = new UpdateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );

    await handler.execute(cmd('hcm-1', { ...patch, scope: 'branch' }));

    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });
});
