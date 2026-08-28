import { BadRequestException, ConflictException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { CreateInventoryReportTemplateHandler } from './create-inventory-report-template.handler';
import { CreateInventoryReportTemplateCommand } from './create-inventory-report-template.command';

const HCM = 'c3bf1922';
const STOCK = 'inventory-stock-summary';
const CATALOG = ['sku', 'name', 'openingQty'];

const withBranch = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: HCM,
  roles: [],
} as any;
const withoutBranch = {
  userId: 'u1',
  organizationId: 'org-1',
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

function makeRepo(dup: boolean): any {
  return {
    findOne: jest.fn(async () => (dup ? { id: 'existing' } : null)),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({
      ...x,
      id: 'new-1',
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    })),
  };
}

const columns = [{ col: 'sku', visible: true, frozen: false }];

function cmd(scope?: 'chain' | 'branch', actor = withBranch) {
  return new CreateInventoryReportTemplateCommand(
    { reportType: STOCK, name: 'Mặc định', columns, scope } as any,
    actor,
  );
}

describe('CreateInventoryReportTemplateHandler scoping', () => {
  it('stamps the actor branch on a branch-scoped template', async () => {
    const repo = makeRepo(false);
    const handler = new CreateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );
    const view = await handler.execute(cmd('branch'));
    expect(repo.create.mock.calls[0][0].branchId).toBe(HCM);
    expect(view).toMatchObject({ scope: 'branch', branchId: HCM });
  });

  it('leaves the branch unset on a chain-scoped template', async () => {
    const repo = makeRepo(false);
    const handler = new CreateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );
    const view = await handler.execute(cmd('chain'));
    expect(repo.create.mock.calls[0][0].branchId).toBeUndefined();
    expect(view).toMatchObject({ scope: 'chain', branchId: null });
  });

  it('checks the name only within its own tier, so two branches may share it', async () => {
    const repo = makeRepo(false);
    const handler = new CreateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );
    await handler.execute(cmd('branch'));
    // An org-wide predicate here is what made every branch fight over one name.
    expect(repo.findOne.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org-1',
      branchId: HCM,
      reportType: STOCK,
      name: 'Mặc định',
    });
  });

  it('scopes the chain-tier duplicate check with IsNull(), not a bare null', async () => {
    const repo = makeRepo(false);
    const handler = new CreateInventoryReportTemplateHandler(
      repo,
      makeRegistry(),
    );
    await handler.execute(cmd('chain'));
    expect(repo.findOne.mock.calls[0][0].where.branchId).toBeInstanceOf(
      FindOperator,
    );
  });

  it('still conflicts on a duplicate name inside the same tier', async () => {
    const handler = new CreateInventoryReportTemplateHandler(
      makeRepo(true),
      makeRegistry(),
    );
    await expect(handler.execute(cmd('branch'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects branch scope when the actor has no active branch', async () => {
    const handler = new CreateInventoryReportTemplateHandler(
      makeRepo(false),
      makeRegistry(),
    );
    await expect(
      handler.execute(cmd('branch', withoutBranch)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
