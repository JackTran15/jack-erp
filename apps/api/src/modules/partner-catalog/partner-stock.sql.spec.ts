import {
  inStockExistsSql,
  resolveStockBranchIds,
  stockedItemIdsSql,
} from './partner-stock.sql';

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('stockedItemIdsSql', () => {
  it('returns each stocked item id once', () => {
    const sql = squash(stockedItemIdsSql({ orgParam: '$1' }));
    expect(sql).toMatch(/^SELECT DISTINCT sb\.item_id FROM stock_balances sb WHERE /);
    expect(sql).toContain('sb.organization_id = $1');
    expect(sql).toContain('sb.quantity > 0');
    expect(sql).not.toContain('branch_id');
  });

  // The set form and the per-item form must be the same definition of stock:
  // a listing that disagrees with its own detail page is the failure the
  // shared module exists to prevent.
  it.each([undefined, '$3'])(
    'uses exactly the conditions inStockExistsSql uses (branchParam=%s)',
    (branchParam) => {
      const set = squash(stockedItemIdsSql({ orgParam: '$1', branchParam }));
      const conditions = set.split(' WHERE ')[1]!;
      const exists = squash(
        inStockExistsSql({ itemIdExpr: 'i.id', orgParam: '$1', branchParam }),
      );
      expect(exists).toContain(`WHERE sb.item_id = i.id AND ${conditions} )`);
    },
  );

  it('casts the branch array to varchar, not uuid', () => {
    const sql = squash(stockedItemIdsSql({ orgParam: '$1', branchParam: '$2' }));
    expect(sql).toContain('sb.branch_id = ANY($2::varchar[])');
    expect(sql).not.toContain('::uuid[]');
  });
});

describe('inStockExistsSql', () => {
  it('scopes to the organization even without a branch list', () => {
    const sql = squash(inStockExistsSql({ itemIdExpr: 'ai.id', orgParam: '$1' }));

    expect(sql).toContain('sb.item_id = ai.id');
    expect(sql).toContain('sb.organization_id = $1');
    expect(sql).toContain('sb.quantity > 0');
    expect(sql).not.toContain('branch_id');
  });

  it('adds a branch filter when branches are supplied', () => {
    const sql = squash(
      inStockExistsSql({ itemIdExpr: 'ai.id', orgParam: '$1', branchParam: '$3' }),
    );
    expect(sql).toContain('sb.branch_id = ANY($3::varchar[])');
  });

  // stock_balances.branch_id is varchar, not uuid. Casting to uuid[] compiles
  // fine and fails at runtime, and only once a branch filter is in play.
  it('casts the branch array to varchar, not uuid', () => {
    const sql = inStockExistsSql({
      itemIdExpr: 'ai.id',
      orgParam: '$1',
      branchParam: '$2',
    });
    expect(sql).toContain('::varchar[]');
    expect(sql).not.toContain('::uuid[]');
  });

  it('works against a different item alias for the detail query', () => {
    const sql = squash(inStockExistsSql({ itemIdExpr: 'i.id', orgParam: '$1' }));
    expect(sql).toContain('sb.item_id = i.id');
  });

  it('never selects a quantity into the result', () => {
    const sql = inStockExistsSql({ itemIdExpr: 'ai.id', orgParam: '$1' });
    expect(sql).toContain('SELECT 1');
    expect(sql).not.toMatch(/SELECT\s+sb\.quantity/);
  });
});

describe('resolveStockBranchIds', () => {
  it('passes a real branch list through', () => {
    expect(resolveStockBranchIds(['b1', 'b2'])).toEqual(['b1', 'b2']);
  });

  // An empty list would compile to `= ANY('{}')`, which matches nothing and
  // would report the whole catalogue as out of stock — wrong, and it looks
  // like a data problem rather than a query problem.
  it('treats an empty list as unscoped rather than as "no branches"', () => {
    expect(resolveStockBranchIds([])).toBeUndefined();
  });

  it('treats a missing list as unscoped', () => {
    expect(resolveStockBranchIds(undefined)).toBeUndefined();
  });
});
