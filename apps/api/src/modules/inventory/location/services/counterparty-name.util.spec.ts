import { EntityManager } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { ProviderEntity } from '../provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';
import {
  attachCounterparties,
  counterpartyNameSql,
  HasCounterparty,
} from './counterparty-name.util';

describe('counterpartyNameSql', () => {
  it('builds a CASE over <alias>.counterparty_kind for all three kinds', () => {
    const sql = counterpartyNameSql('gr');
    expect(sql).toContain('gr.counterparty_kind');
    expect(sql).toContain('inventory_providers');
    expect(sql).toContain('customers');
    expect(sql).toContain('users');
    expect(sql).toContain('gr.organization_id');
  });
});

describe('attachCounterparties', () => {
  const organizationId = 'org-1';

  function makeManager(data: {
    providers?: unknown[];
    customers?: unknown[];
    users?: unknown[];
  }) {
    const find = jest.fn(async (entity: unknown, _opts?: { where: unknown }) => {
      if (entity === ProviderEntity) return data.providers ?? [];
      if (entity === CustomerEntity) return data.customers ?? [];
      if (entity === UserEntity) return data.users ?? [];
      return [];
    });
    return { manager: { find } as unknown as EntityManager, find };
  }

  it('resolves supplier, customer and employee names and inlines them', async () => {
    const { manager, find } = makeManager({
      providers: [{ id: 's1', code: 'NCC001', name: 'Acme' }],
      customers: [{ id: 'c1', code: 'KH001', name: 'Khach A' }],
      users: [{ id: 'u1', firstName: 'Nguyen', lastName: 'Van A' }],
    });
    const rows: HasCounterparty[] = [
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 's1' },
      { counterpartyKind: DocCounterpartyKind.CUSTOMER, counterpartyId: 'c1' },
      { counterpartyKind: DocCounterpartyKind.EMPLOYEE, counterpartyId: 'u1' },
    ];

    await attachCounterparties(manager, rows, organizationId);

    expect(rows[0].counterparty).toEqual({
      kind: DocCounterpartyKind.SUPPLIER,
      id: 's1',
      code: 'NCC001',
      name: 'Acme',
    });
    expect(rows[1].counterparty).toEqual({
      kind: DocCounterpartyKind.CUSTOMER,
      id: 'c1',
      code: 'KH001',
      name: 'Khach A',
    });
    expect(rows[2].counterparty).toEqual({
      kind: DocCounterpartyKind.EMPLOYEE,
      id: 'u1',
      code: null,
      name: 'Nguyen Van A',
    });
    // One query per kind present — no N+1.
    expect(find).toHaveBeenCalledTimes(3);
  });

  it('batches a kind into a single query regardless of row count', async () => {
    const { manager, find } = makeManager({
      providers: [
        { id: 's1', code: 'NCC001', name: 'Acme' },
        { id: 's2', code: 'NCC002', name: 'Beta' },
      ],
    });
    const rows: HasCounterparty[] = [
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 's1' },
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 's2' },
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 's1' },
    ];

    await attachCounterparties(manager, rows, organizationId);

    expect(find).toHaveBeenCalledTimes(1);
    expect(rows[2].counterparty?.name).toBe('Acme');
  });

  it('sets null when the row has no counterparty or it is not found', async () => {
    const { manager, find } = makeManager({ providers: [] });
    const rows: HasCounterparty[] = [
      {},
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 'missing' },
    ];

    await attachCounterparties(manager, rows, organizationId);

    expect(rows[0].counterparty).toBeNull();
    expect(rows[1].counterparty).toBeNull();
    // Only the supplier kind is present → customer/employee queries skipped.
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('scopes every lookup by organizationId', async () => {
    const { manager, find } = makeManager({
      providers: [{ id: 's1', code: 'X', name: 'Y' }],
    });

    await attachCounterparties(
      manager,
      [{ counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 's1' }],
      organizationId,
    );

    const opts = find.mock.calls[0][1];
    expect(opts?.where).toEqual([{ id: 's1', organizationId }]);
  });
});
