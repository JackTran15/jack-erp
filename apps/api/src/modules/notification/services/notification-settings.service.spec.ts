import { BadRequestException } from '@nestjs/common';
import { NotificationSettingsService } from './notification-settings.service';

const actor = { userId: 'u1', organizationId: 'o1', branchIds: ['b1'], roles: [] } as any;

function setup(row?: { scope_branch_id: string | null; enabled_types: string[] }) {
  const queries: Array<{ sql: string; params: any[] }> = [];
  let stored = row;
  const dataSource = {
    query: jest.fn(async (sql: string, params: any[]) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT')) return stored ? [stored] : [];
      if (sql.includes('INSERT INTO "user_notification_settings"')) {
        stored = { scope_branch_id: params[2], enabled_types: params[3] };
      }
      return [];
    }),
  };
  const defs: Record<string, { defaultEnabled: boolean; apps: string[] }> = {
    invoice: { defaultEnabled: true, apps: ['erp_manager'] },
    revenue: { defaultEnabled: false, apps: ['erp_manager'] },
    sales_order: { defaultEnabled: true, apps: ['erp_sales'] },
  };
  const registry = {
    typesForApp: (app: string) => Object.keys(defs).filter((t) => defs[t].apps.includes(app)),
    byType: (t: string) => defs[t],
  };
  return { service: new NotificationSettingsService(dataSource as any, registry as any), queries };
}

describe('NotificationSettingsService', () => {
  it('never-saved user gets defaults + the available list of the app', async () => {
    const { service } = setup();
    await expect(service.get(actor, 'erp_manager')).resolves.toEqual({
      scopeBranchId: null,
      enabledTypes: ['invoice'],
      availableTypes: ['invoice', 'revenue'],
    });
  });

  it('saving from one app keeps the other app types and drops unknown codes', async () => {
    const { service, queries } = setup({ scope_branch_id: null, enabled_types: ['sales_order', 'invoice'] });
    const result = await service.save(actor, 'erp_manager', {
      scopeBranchId: 'b1',
      enabledTypes: ['revenue', 'near_expiry'],
    });

    const insert = queries.find((q) => q.sql.includes('INSERT'))!;
    expect(insert.params[3]).toEqual(['sales_order', 'revenue']);
    expect(result).toEqual({ scopeBranchId: 'b1', enabledTypes: ['revenue'], availableTypes: ['invoice', 'revenue'] });
  });

  it('rejects a branch the user cannot access', async () => {
    const { service } = setup();
    await expect(service.save(actor, 'erp_manager', { scopeBranchId: 'b9', enabledTypes: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
