import {
  buildExactMatchCte,
  buildItemIdsCte,
  buildSuggestCte,
} from './pos-catalog-sql';

describe('buildExactMatchCte', () => {
  const sql = buildExactMatchCte({ org: '$1', code: '$3' });

  it('unions two independently indexable arms', () => {
    expect(sql).toContain('UNION');
    expect(sql.match(/FROM items i/g)).toHaveLength(2);
  });

  it('does not reach item_barcodes through a LEFT JOIN', () => {
    // An OR spanning a LEFT JOIN cannot use either unique index; that shape is
    // exactly what this builder exists to replace.
    expect(sql).not.toContain('LEFT JOIN item_barcodes');
  });

  it('does not reach item_barcodes through a correlated EXISTS either', () => {
    // Measured slower than the original OR form: the planner scans every
    // POS-visible item and runs the subplan as a per-row filter.
    expect(sql).not.toContain('EXISTS');
  });

  it('scopes both arms by organization and filters to sellable items', () => {
    expect(sql.match(/organization_id = \$1/g)).toHaveLength(2);
    expect(sql.match(/is_active = true/g)).toHaveLength(2);
    expect(sql.match(/is_pos_visible = true/g)).toHaveLength(2);
  });

  it('matches the code on both items.code and item_barcodes.code', () => {
    expect(sql).toContain('i.code = $3');
    expect(sql).toContain('b.code = $3');
  });

  it('interpolates only the placeholders it was given', () => {
    const other = buildExactMatchCte({ org: '$4', code: '$5' });
    expect(other).toContain('organization_id = $4');
    expect(other).toContain('i.code = $5');
    expect(other).not.toContain('$1');
    expect(other).not.toContain('$3');
  });
});

describe('buildSuggestCte', () => {
  const sql = buildSuggestCte({ org: '$1', pattern: '$3', limit: 20 });

  it('unions three independently indexable arms', () => {
    expect(sql.match(/UNION/g)).toHaveLength(2);
    expect(sql.match(/FROM items i/g)).toHaveLength(3);
  });

  it('never reaches a joined table through EXISTS', () => {
    // Measured slower than the OR-across-a-LEFT-JOIN form it would replace.
    expect(sql).not.toContain('EXISTS');
  });

  it('does not reach item_barcodes or products through a LEFT JOIN', () => {
    expect(sql).not.toContain('LEFT JOIN');
  });

  it('matches the pattern on every column the catalogue search covers', () => {
    expect(sql).toContain('i.name ILIKE $3');
    expect(sql).toContain('i.code ILIKE $3');
    expect(sql).toContain('b.code ILIKE $3');
    expect(sql).toContain('p.code ILIKE $3');
    expect(sql).toContain('p.name ILIKE $3');
  });

  it('scopes all three arms by organization', () => {
    expect(sql.match(/organization_id = \$1/g)).toHaveLength(3);
  });

  it('caps the matched items, not the joined result', () => {
    expect(sql).toContain('LIMIT 20');
    // The cap has to sit inside the subquery that selects item ids, so the
    // caller can join stock onto an already-bounded set.
    expect(sql.trim().endsWith('LIMIT 20')).toBe(true);
    expect(sql).toContain('ORDER BY u.name ASC');
  });

  it('emits no LIMIT and no ORDER BY when no cap is given', () => {
    const unbounded = buildSuggestCte({ org: '$1', pattern: '$3' });
    expect(unbounded).not.toContain('LIMIT');
    expect(unbounded).not.toContain('ORDER BY');
    // Same three arms either way.
    expect(unbounded.match(/UNION/g)).toHaveLength(2);
  });
});

describe('buildItemIdsCte', () => {
  const sql = buildItemIdsCte({ org: '$1', itemIds: '$3' });

  it('binds the id list as one array parameter', () => {
    expect(sql).toContain('= ANY($3::uuid[])');
  });

  it('never interpolates ids into the statement', () => {
    // The other two builders only ever see placeholders; this one is driven by
    // caller-supplied values, so quoting anything here would be the one way to
    // open an injection hole in this file.
    const withIds = buildItemIdsCte({ org: '$1', itemIds: '$3' });
    expect(withIds).not.toContain("'");
    expect(withIds).not.toContain('IN (');
  });

  it('scopes by organization and keeps only sellable items', () => {
    expect(sql).toContain('organization_id = $1');
    expect(sql).toContain('is_active = true');
    expect(sql).toContain('is_pos_visible = true');
  });

  it('interpolates only the placeholders it was given', () => {
    const other = buildItemIdsCte({ org: '$7', itemIds: '$8' });
    expect(other).toContain('organization_id = $7');
    expect(other).toContain('= ANY($8::uuid[])');
    expect(other).not.toContain('$1');
    expect(other).not.toContain('$3');
  });
});
