import { CounterpartyKind } from '../dto/search-counterparties.dto';
import { SearchCounterpartiesHandler } from './search-counterparties.handler';
import { SearchCounterpartiesQuery } from './search-counterparties.query';

const actor = { organizationId: 'org1', userId: 'u1', roles: [] } as never;

function qb(result: { manyAndCount?: unknown; rawMany?: unknown; count?: number }) {
  const self: Record<string, unknown> = {};
  for (const m of [
    'where', 'andWhere', 'orderBy', 'addOrderBy', 'leftJoin',
    'select', 'addSelect', 'skip', 'take', 'offset', 'limit',
  ]) {
    self[m] = () => self;
  }
  self.getManyAndCount = async () => result.manyAndCount;
  self.getRawMany = async () => result.rawMany;
  self.getCount = async () => result.count;
  return self;
}

function makeHandler(opts: {
  suppliers: { rows: unknown[]; total: number };
  customers: { rows: unknown[]; total: number };
  employees: { rows: unknown[]; count: number };
}): SearchCounterpartiesHandler {
  const providerRepo = {
    createQueryBuilder: () =>
      qb({ manyAndCount: [opts.suppliers.rows, opts.suppliers.total] }),
  };
  const customerRepo = {
    createQueryBuilder: () =>
      qb({ manyAndCount: [opts.customers.rows, opts.customers.total] }),
  };
  const userRepo = {
    createQueryBuilder: () =>
      qb({ rawMany: opts.employees.rows, count: opts.employees.count }),
  };
  return new SearchCounterpartiesHandler(
    providerRepo as never,
    customerRepo as never,
    userRepo as never,
  );
}

describe('SearchCounterpartiesHandler', () => {
  it('returns only suppliers for type=supplier and maps address from notes', async () => {
    const handler = makeHandler({
      suppliers: {
        rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1', notes: 'note-addr' }],
        total: 1,
      },
      customers: { rows: [], total: 0 },
      employees: { rows: [], count: 0 },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        { type: CounterpartyKind.SUPPLIER, page: 1, pageSize: 20 },
        actor,
      ),
    );

    expect(res.total).toBe(1);
    expect(res.data).toEqual([
      { kind: 'supplier', id: 's1', code: 'NCC1', name: 'Beta', phone: '1', address: 'note-addr' },
    ]);
  });

  it('merges all three kinds sorted by name with summed total', async () => {
    const handler = makeHandler({
      suppliers: { rows: [{ id: 's1', code: 'NCC1', name: 'Beta', phone: '1' }], total: 1 },
      customers: { rows: [{ id: 'c1', code: 'KH1', name: 'Alpha', phone: '2', address: 'a' }], total: 1 },
      employees: {
        rows: [{ id: 'e1', firstName: 'Zoe', lastName: 'Z', code: 'NV1', mobile: '3' }],
        count: 1,
      },
    });

    const res = await handler.execute(
      new SearchCounterpartiesQuery(
        { type: CounterpartyKind.ALL, page: 1, pageSize: 20 },
        actor,
      ),
    );

    expect(res.total).toBe(3);
    expect(res.data.map((d) => d.name)).toEqual(['Alpha', 'Beta', 'Zoe Z']);
    expect(res.data.map((d) => d.kind)).toEqual(['customer', 'supplier', 'employee']);
    expect(res.data[2]).toMatchObject({ id: 'e1', code: 'NV1', phone: '3' });
  });
});
