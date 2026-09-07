import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import { ListInventoryReportTemplatesHandler } from '../../inventory-reports/queries/list-inventory-report-templates.handler';
import { ListInventoryReportTemplatesQuery } from '../../inventory-reports/queries/list-inventory-report-templates.query';
import { GetInventoryReportTemplateHandler } from '../../inventory-reports/queries/get-inventory-report-template.handler';
import { GetInventoryReportTemplateQuery } from '../../inventory-reports/queries/get-inventory-report-template.query';
import { UpdateInventoryReportTemplateHandler } from '../../inventory-reports/commands/update-inventory-report-template.handler';
import { UpdateInventoryReportTemplateCommand } from '../../inventory-reports/commands/update-inventory-report-template.command';
import { DeleteInventoryReportTemplateHandler } from '../../inventory-reports/commands/delete-inventory-report-template.handler';
import { DeleteInventoryReportTemplateCommand } from '../../inventory-reports/commands/delete-inventory-report-template.command';

import { ListInvoiceReportTemplatesHandler } from '../invoice-report/queries/list-invoice-report-templates.handler';
import { ListInvoiceReportTemplatesQuery } from '../invoice-report/queries/list-invoice-report-templates.query';
import { GetInvoiceReportTemplateHandler } from '../invoice-report/queries/get-invoice-report-template.handler';
import { GetInvoiceReportTemplateQuery } from '../invoice-report/queries/get-invoice-report-template.query';
import { UpdateInvoiceReportTemplateHandler } from '../invoice-report/commands/update-invoice-report-template.handler';
import { UpdateInvoiceReportTemplateCommand } from '../invoice-report/commands/update-invoice-report-template.command';
import { DeleteInvoiceReportTemplateHandler } from '../invoice-report/commands/delete-invoice-report-template.handler';
import { DeleteInvoiceReportTemplateCommand } from '../invoice-report/commands/delete-invoice-report-template.command';

import { ListDebtReportTemplatesHandler } from '../debt-report/queries/list-debt-report-templates.handler';
import { ListDebtReportTemplatesQuery } from '../debt-report/queries/list-debt-report-templates.query';
import { GetDebtReportTemplateHandler } from '../debt-report/queries/get-debt-report-template.handler';
import { GetDebtReportTemplateQuery } from '../debt-report/queries/get-debt-report-template.query';
import { UpdateDebtReportTemplateHandler } from '../debt-report/commands/update-debt-report-template.handler';
import { UpdateDebtReportTemplateCommand } from '../debt-report/commands/update-debt-report-template.command';
import { DeleteDebtReportTemplateHandler } from '../debt-report/commands/delete-debt-report-template.handler';
import { DeleteDebtReportTemplateCommand } from '../debt-report/commands/delete-debt-report-template.command';

import { ListProfitReportTemplatesHandler } from '../profit-report/queries/list-profit-report-templates.handler';
import { ListProfitReportTemplatesQuery } from '../profit-report/queries/list-profit-report-templates.query';
import { GetProfitReportTemplateHandler } from '../profit-report/queries/get-profit-report-template.handler';
import { GetProfitReportTemplateQuery } from '../profit-report/queries/get-profit-report-template.query';
import { UpdateProfitReportTemplateHandler } from '../profit-report/commands/update-profit-report-template.handler';
import { UpdateProfitReportTemplateCommand } from '../profit-report/commands/update-profit-report-template.command';
import { DeleteProfitReportTemplateHandler } from '../profit-report/commands/delete-profit-report-template.handler';
import { DeleteProfitReportTemplateCommand } from '../profit-report/commands/delete-profit-report-template.command';

/**
 * Four report domains run twenty near-identical handlers over one shared
 * `report_templates` table. The risk is not getting one wrong, it is missing
 * one: a domain still scoped to the organization keeps leaking one branch's
 * layout to every other branch, and only shows up on a tenant with more than
 * one branch. So the same cases run against all four.
 */

const HCM = 'c3bf1922';
const HN = '09743ddb';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: HCM,
  roles: [],
} as any;

interface Domain {
  name: string;
  reportType: string;
  List: any;
  ListQuery: any;
  Get: any;
  GetQuery: any;
  Update: any;
  UpdateCommand: any;
  Delete: any;
  DeleteCommand: any;
}

const DOMAINS: Domain[] = [
  {
    name: 'inventory',
    reportType: 'inventory-stock-summary',
    List: ListInventoryReportTemplatesHandler,
    ListQuery: ListInventoryReportTemplatesQuery,
    Get: GetInventoryReportTemplateHandler,
    GetQuery: GetInventoryReportTemplateQuery,
    Update: UpdateInventoryReportTemplateHandler,
    UpdateCommand: UpdateInventoryReportTemplateCommand,
    Delete: DeleteInventoryReportTemplateHandler,
    DeleteCommand: DeleteInventoryReportTemplateCommand,
  },
  {
    name: 'invoice',
    reportType: 'daily-sales-summary',
    List: ListInvoiceReportTemplatesHandler,
    ListQuery: ListInvoiceReportTemplatesQuery,
    Get: GetInvoiceReportTemplateHandler,
    GetQuery: GetInvoiceReportTemplateQuery,
    Update: UpdateInvoiceReportTemplateHandler,
    UpdateCommand: UpdateInvoiceReportTemplateCommand,
    Delete: DeleteInvoiceReportTemplateHandler,
    DeleteCommand: DeleteInvoiceReportTemplateCommand,
  },
  {
    name: 'debt',
    reportType: 'customer-debts-summary',
    List: ListDebtReportTemplatesHandler,
    ListQuery: ListDebtReportTemplatesQuery,
    Get: GetDebtReportTemplateHandler,
    GetQuery: GetDebtReportTemplateQuery,
    Update: UpdateDebtReportTemplateHandler,
    UpdateCommand: UpdateDebtReportTemplateCommand,
    Delete: DeleteDebtReportTemplateHandler,
    DeleteCommand: DeleteDebtReportTemplateCommand,
  },
  {
    name: 'profit',
    reportType: 'profit-by-item',
    List: ListProfitReportTemplatesHandler,
    ListQuery: ListProfitReportTemplatesQuery,
    Get: GetProfitReportTemplateHandler,
    GetQuery: GetProfitReportTemplateQuery,
    Update: UpdateProfitReportTemplateHandler,
    UpdateCommand: UpdateProfitReportTemplateCommand,
    Delete: DeleteProfitReportTemplateHandler,
    DeleteCommand: DeleteProfitReportTemplateCommand,
  },
];

function row(id: string, branchId: string | null, reportType: string): any {
  return {
    id,
    organizationId: 'org-1',
    branchId: branchId ?? undefined,
    reportType,
    name: 'Mặc định',
    description: null,
    columns: [
      { col: 'a', displayName: null, visible: true, frozen: false, order: 0 },
    ],
    filters: { columnFilters: [] },
    sortOrder: 0,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };
}

/** Registry accepting only this domain's report type, with a one-column catalog. */
function makeRegistry(reportType: string): any {
  return {
    list: jest.fn(() => [reportType]),
    get: jest.fn((key: string) =>
      key === reportType
        ? {
            buildColumns: jest.fn(async () => [
              { col: 'a', name: 'A', desc: null, type: 'number', group: null },
            ]),
          }
        : undefined,
    ),
  };
}

describe.each(DOMAINS)('$name report templates — branch scoping', (d) => {
  const registry = () => makeRegistry(d.reportType);

  it('falls back to the chain template when the branch has none', async () => {
    const repo = { find: jest.fn(async () => [row('chain-1', null, d.reportType)]) };
    const handler = new d.List(repo as any, registry());
    const result = await handler.execute(
      new d.ListQuery(actor, d.reportType, 'branch'),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 'chain-1', scope: 'chain', branchId: null }),
    ]);
  });

  it('shadows the chain template with the branch one', async () => {
    const repo = {
      find: jest.fn(async () => [
        row('own-1', HCM, d.reportType),
        row('chain-1', null, d.reportType),
      ]),
    };
    const handler = new d.List(repo as any, registry());
    const result = await handler.execute(
      new d.ListQuery(actor, d.reportType, 'branch'),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: 'own-1', scope: 'branch', branchId: HCM }),
    ]);
  });

  it('never returns another branch template', async () => {
    const repo = { find: jest.fn(async () => [row('hn-1', HN, d.reportType)]) };
    const handler = new d.List(repo as any, registry());
    await expect(
      handler.execute(new d.ListQuery(actor, d.reportType, 'branch')),
    ).resolves.toEqual([]);
  });

  it('404s on a template the predicate excludes', async () => {
    const repo = { findOne: jest.fn(async () => null) };
    const handler = new d.Get(repo as any, registry());
    await expect(
      handler.execute(new d.GetQuery('hn-1', actor, 'branch')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forks the chain template rather than editing it', async () => {
    const chain = row('chain-1', null, d.reportType);
    const repo = {
      findOne: jest.fn().mockResolvedValueOnce(chain).mockResolvedValue(null),
      save: jest.fn(async (x: any) => ({
        ...x,
        id: x.id ?? 'forked-1',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        updatedAt: new Date('2026-06-02T00:00:00Z'),
      })),
    };
    const handler = new d.Update(repo as any, registry());
    await handler.execute(
      new d.UpdateCommand(
        'chain-1',
        {
          scope: 'branch',
          columns: [{ col: 'a', visible: true, frozen: false }],
        } as any,
        actor,
      ),
    );
    const saved = repo.save.mock.calls[0][0];
    expect(saved.id).toBeUndefined();
    expect(saved.branchId).toBe(HCM);
  });

  it('refuses to delete outside its own tier', async () => {
    const repo = {
      findOne: jest.fn(async () => null),
      softRemove: jest.fn(),
    };
    const handler = new d.Delete(repo as any, registry());
    await expect(
      handler.execute(new d.DeleteCommand('chain-1', actor, 'branch')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.softRemove).not.toHaveBeenCalled();
  });
});

/**
 * Source-level guard. The table above only covers the handlers it names — add a
 * fifth domain, or a sixth handler, and it says nothing. This catches the shape
 * the migration away from organization-only scoping was meant to remove,
 * wherever it appears.
 */
describe('no template handler is still scoped to the organization alone', () => {
  const ROOTS = [
    'src/modules/reporting/invoice-report',
    'src/modules/reporting/debt-report',
    'src/modules/reporting/profit-report',
    'src/modules/inventory-reports',
  ];

  function templateHandlers(): string[] {
    const found: string[] = [];
    for (const rootRel of ROOTS) {
      const root = path.resolve(__dirname, '../../../..', rootRel);
      for (const sub of ['queries', 'commands']) {
        const dir = path.join(root, sub);
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (f.includes('template') && f.endsWith('.handler.ts')) {
            found.push(path.join(dir, f));
          }
        }
      }
    }
    return found;
  }

  it('finds all twenty handlers', () => {
    expect(templateHandlers()).toHaveLength(20);
  });

  it.each(templateHandlers())('%s resolves a scope', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).toContain('resolveTemplateScope');
    // The bare organization predicate is what leaked layouts across branches.
    expect(src).not.toMatch(/where:\s*\{\s*id,\s*organizationId: actor\.organizationId\s*\}/);
  });
});
