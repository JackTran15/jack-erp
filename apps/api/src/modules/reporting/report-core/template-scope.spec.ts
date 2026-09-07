import { BadRequestException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { ReportTemplateEntity } from './report-template.entity';
import {
  cloneForBranch,
  pickEffective,
  readScopeWhere,
  resolveTemplateScope,
  writeScopeWhere,
} from './template-scope';

const withBranch = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: 'b1',
  roles: [],
} as any;
const withoutBranch = {
  userId: 'u1',
  organizationId: 'org-1',
  roles: [],
} as any;

function row(
  branchId: string | null,
  name = 'Mặc định',
  reportType = 'inventory-stock-summary',
): ReportTemplateEntity {
  return {
    id: `${branchId ?? 'chain'}-${name}`,
    organizationId: 'org-1',
    branchId: branchId ?? undefined,
    reportType,
    name,
    columns: [],
    filters: {},
    sortOrder: 0,
  } as unknown as ReportTemplateEntity;
}

/** `IsNull()` is a FindOperator; a plain `null` is not, and the difference is the bug. */
function isNullOperator(value: unknown): boolean {
  return value instanceof FindOperator && value.type === 'isNull';
}

describe('resolveTemplateScope', () => {
  it("maps 'chain' to the null tier", () => {
    expect(resolveTemplateScope('chain', withBranch)).toEqual({
      scope: 'chain',
      branchId: null,
    });
  });

  it("maps 'branch' to the actor's branch", () => {
    expect(resolveTemplateScope('branch', withBranch)).toEqual({
      scope: 'branch',
      branchId: 'b1',
    });
  });

  it("rejects 'branch' when the actor has no active branch", () => {
    expect(() => resolveTemplateScope('branch', withoutBranch)).toThrow(
      BadRequestException,
    );
  });

  it('defaults to the branch tier when the actor has a branch', () => {
    expect(resolveTemplateScope(undefined, withBranch)).toEqual({
      scope: 'branch',
      branchId: 'b1',
    });
  });

  it('defaults to the chain tier when the actor has no branch', () => {
    expect(resolveTemplateScope(undefined, withoutBranch)).toEqual({
      scope: 'chain',
      branchId: null,
    });
  });
});

describe('readScopeWhere', () => {
  it('lets the branch tier see the chain tier too', () => {
    const where = readScopeWhere(withBranch, {
      scope: 'branch',
      branchId: 'b1',
    });
    expect(where).toHaveLength(2);
    expect(where[0].branchId).toBe('b1');
    expect(isNullOperator(where[1].branchId)).toBe(true);
    expect(where.every((w) => w.organizationId === 'org-1')).toBe(true);
  });

  it('restricts the chain tier to chain rows only', () => {
    const where = readScopeWhere(withBranch, { scope: 'chain', branchId: null });
    expect(where).toHaveLength(1);
    expect(isNullOperator(where[0].branchId)).toBe(true);
  });
});

describe('writeScopeWhere', () => {
  it('matches the branch tier exactly', () => {
    expect(
      writeScopeWhere(withBranch, { scope: 'branch', branchId: 'b1' }),
    ).toEqual({ organizationId: 'org-1', branchId: 'b1' });
  });

  it('uses IsNull() for the chain tier rather than a bare null', () => {
    const where = writeScopeWhere(withBranch, {
      scope: 'chain',
      branchId: null,
    });
    expect(isNullOperator(where.branchId)).toBe(true);
  });
});

describe('pickEffective', () => {
  it('falls back to the chain row when the branch has none', () => {
    const rows = [row(null)];
    expect(
      pickEffective(rows, { scope: 'branch', branchId: 'b1' }),
    ).toEqual(rows);
  });

  it('shadows the chain row with the branch row of the same report and name', () => {
    const branch = row('b1');
    const picked = pickEffective([branch, row(null)], {
      scope: 'branch',
      branchId: 'b1',
    });
    expect(picked).toEqual([branch]);
  });

  it('keeps a chain row the branch does not shadow', () => {
    const branch = row('b1', 'Bố cục A');
    const chainOther = row(null, 'Bố cục B');
    const picked = pickEffective([branch, row(null, 'Bố cục A'), chainOther], {
      scope: 'branch',
      branchId: 'b1',
    });
    expect(picked).toEqual([branch, chainOther]);
  });

  it('drops rows belonging to another branch', () => {
    expect(
      pickEffective([row('b2')], { scope: 'branch', branchId: 'b1' }),
    ).toEqual([]);
  });

  it('returns only chain rows in the chain tier', () => {
    const chain = row(null);
    expect(
      pickEffective([row('b1'), chain], { scope: 'chain', branchId: null }),
    ).toEqual([chain]);
  });
});

describe('cloneForBranch', () => {
  it('does not carry the source id — that would UPDATE the chain row', () => {
    const clone = cloneForBranch(row(null), 'b1', 'u1');
    expect(clone.id).toBeUndefined();
    expect(clone.branchId).toBe('b1');
    expect(clone.createdBy).toBe('u1');
  });

  it('copies the layout payload', () => {
    const source = row(null);
    source.columns = [
      { col: 'date', displayName: null, visible: true, frozen: false, order: 0 },
    ];
    source.filters = { columnFilters: [] };
    const clone = cloneForBranch(source, 'b1', 'u1');
    expect(clone.columns).toEqual(source.columns);
    expect(clone.filters).toEqual(source.filters);
    expect(clone.reportType).toBe(source.reportType);
    expect(clone.name).toBe(source.name);
  });
});
