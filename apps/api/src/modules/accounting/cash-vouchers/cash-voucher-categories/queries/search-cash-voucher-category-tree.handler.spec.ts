import { CashVoucherCategoryDirection } from '../../enums';
import { SearchCashVoucherCategoryTreeHandler } from './search-cash-voucher-category-tree.handler';
import { SearchCashVoucherCategoryTreeQuery } from './search-cash-voucher-category-tree.query';

const IN = CashVoucherCategoryDirection.IN;
const OUT = CashVoucherCategoryDirection.OUT;

type Row = {
  id: string;
  code: string;
  name: string;
  direction?: CashVoucherCategoryDirection;
  isActive?: boolean;
  displayOrder?: number;
  description?: string | null;
  parentGroupId?: string | null;
  createdAt?: Date;
};

const actor = { organizationId: 'org1', userId: 'u1', roles: [] } as never;

/**
 * The repo mock applies the `where` and `order` the handler sends, so the
 * tests cover the filter/ordering contract and not just the in-memory
 * assembly.
 */
function handlerWith(rows: Row[]) {
  const all = rows.map((r) => ({
    direction: OUT,
    isActive: true,
    displayOrder: 0,
    description: null,
    parentGroupId: null,
    createdAt: new Date('2026-09-18T00:00:00Z'),
    organizationId: 'org1',
    ...r,
  }));
  const find = jest.fn(async ({ where, order }) => {
    const filtered = all.filter(
      (r) =>
        r.organizationId === where.organizationId &&
        (where.direction === undefined || r.direction === where.direction) &&
        (where.isActive === undefined || r.isActive === where.isActive),
    );
    expect(order).toEqual({ displayOrder: 'ASC', name: 'ASC' });
    return filtered.sort(
      (a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name),
    );
  });
  return { handler: new SearchCashVoucherCategoryTreeHandler({ find } as never), find };
}

const run = (handler: SearchCashVoucherCategoryTreeHandler, dto = {}) =>
  handler.execute(new SearchCashVoucherCategoryTreeQuery(dto, actor));

describe('SearchCashVoucherCategoryTreeHandler', () => {
  it('nests children under their parent and orders siblings by displayOrder then name', async () => {
    const { handler } = handlerWith([
      { id: 'g2', code: 'G2', name: 'Nhóm B', displayOrder: 2 },
      { id: 'g1', code: 'G1', name: 'Nhóm A', displayOrder: 1 },
      { id: 'c-late', code: 'C2', name: 'Con muộn', parentGroupId: 'g1', displayOrder: 5 },
      { id: 'c-early', code: 'C1', name: 'Con sớm', parentGroupId: 'g1', displayOrder: 1 },
      { id: 'tie-b', code: 'T2', name: 'B', parentGroupId: 'g2', displayOrder: 1 },
      { id: 'tie-a', code: 'T1', name: 'A', parentGroupId: 'g2', displayOrder: 1 },
    ]);

    const { data } = await run(handler);

    expect(data.map((n) => n.id)).toEqual(['g1', 'g2']);
    expect(data[0].children.map((c) => c.id)).toEqual(['c-early', 'c-late']);
    expect(data[1].children.map((c) => c.id)).toEqual(['tie-a', 'tie-b']);
  });

  it('carries every field the table and dropdown need', async () => {
    const { handler } = handlerWith([
      { id: 'g1', code: 'CP', name: 'Chi phí', description: 'Nhóm', displayOrder: 3, isActive: false },
      { id: 'c1', code: 'DIEN', name: 'Tiền điện', parentGroupId: 'g1', direction: OUT },
    ]);

    const { data } = await run(handler);

    expect(data[0]).toMatchObject({
      id: 'g1',
      code: 'CP',
      name: 'Chi phí',
      description: 'Nhóm',
      direction: OUT,
      isActive: false,
      displayOrder: 3,
      parentGroupId: null,
      createdAt: new Date('2026-09-18T00:00:00Z'),
    });
    expect(data[0].children[0]).toMatchObject({
      id: 'c1',
      parentGroupId: 'g1',
      description: null,
      children: [],
    });
  });

  it('scopes to the actor organization and passes direction / isActive to the query', async () => {
    const { handler, find } = handlerWith([
      { id: 'in', code: 'THU', name: 'Thu', direction: IN },
      { id: 'out', code: 'CHI', name: 'Chi', direction: OUT },
      { id: 'off', code: 'OFF', name: 'Tắt', direction: OUT, isActive: false },
    ]);

    const byDirection = await run(handler, { direction: OUT });
    expect(byDirection.data.map((n) => n.id).sort()).toEqual(['off', 'out']);
    expect(find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1', direction: OUT } }),
    );

    const active = await run(handler, { isActive: true });
    expect(active.data.map((n) => n.id).sort()).toEqual(['in', 'out']);
    expect(find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { organizationId: 'org1', isActive: true } }),
    );
  });

  it('treats a child whose parent is missing from the result as a root', async () => {
    const { handler } = handlerWith([
      { id: 'orphan', code: 'MC', name: 'Mồ côi', parentGroupId: 'soft-deleted-parent' },
    ]);

    const { data } = await run(handler);

    expect(data.map((n) => n.id)).toEqual(['orphan']);
    expect(data[0].parentGroupId).toBe('soft-deleted-parent');
  });

  it('keeps the parent path when only a descendant matches the search, and prunes the rest', async () => {
    const { handler } = handlerWith([
      { id: 'g1', code: 'CP', name: 'Chi phí vận hành', displayOrder: 1 },
      { id: 'c1', code: 'DIEN', name: 'Tiền điện', parentGroupId: 'g1' },
      { id: 'c2', code: 'NUOC', name: 'Tiền nước', parentGroupId: 'g1' },
      { id: 'g2', code: 'LUONG', name: 'Lương thưởng', displayOrder: 2 },
      { id: 'c3', code: 'THUONG', name: 'Thưởng', parentGroupId: 'g2' },
    ]);

    const { data } = await run(handler, { search: 'điện' });

    expect(data.map((n) => n.id)).toEqual(['g1']);
    expect(data[0].children.map((c) => c.id)).toEqual(['c1']);
  });

  it('matches on code case-insensitively and keeps the whole subtree of a matching node', async () => {
    const { handler } = handlerWith([
      { id: 'g1', code: 'CP_VAN_HANH', name: 'Chi phí vận hành' },
      { id: 'c1', code: 'DIEN', name: 'Tiền điện', parentGroupId: 'g1' },
      { id: 'c2', code: 'NUOC', name: 'Tiền nước', parentGroupId: 'g1' },
      { id: 'g2', code: 'KHAC', name: 'Khác' },
    ]);

    const { data } = await run(handler, { search: 'cp_van' });

    expect(data.map((n) => n.id)).toEqual(['g1']);
    expect(data[0].children.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});
