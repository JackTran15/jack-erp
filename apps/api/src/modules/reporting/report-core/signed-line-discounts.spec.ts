import { Repository } from 'typeorm';
import { InvoiceItemEntity, ItemDirection } from '../../pos/entities/invoice-item.entity';
import { loadSignedLineDiscounts } from './report-query.util';

interface FakeLine {
  invoiceId: string;
  direction: ItemDirection;
  lineDiscount: number;
  promotionDiscount: number;
}

/**
 * Stands in for the query builder, evaluating the same aggregation the SQL does:
 * group by invoice, sum each line signed by `direction`. The SQL text itself is
 * exercised against a real database by the report specs that consume this helper.
 */
function fakeRepo(lines: FakeLine[]) {
  const calls: { ids: string[] }[] = [];
  const repo = {
    createQueryBuilder: () => {
      let ids: string[] = [];
      const qb = {
        select: () => qb,
        addSelect: () => qb,
        where: (_sql: string, params: { ids: string[] }) => {
          ids = params.ids;
          return qb;
        },
        setParameter: () => qb,
        groupBy: () => qb,
        getRawMany: () => {
          calls.push({ ids });
          const sums = new Map<string, number>();
          for (const l of lines) {
            if (!ids.includes(l.invoiceId)) continue;
            const sign = l.direction === ItemDirection.IN ? -1 : 1;
            sums.set(
              l.invoiceId,
              (sums.get(l.invoiceId) ?? 0) +
                sign * (l.lineDiscount + l.promotionDiscount),
            );
          }
          return Promise.resolve(
            [...sums].map(([invoiceId, amount]) => ({
              invoiceId,
              amount: String(amount),
            })),
          );
        },
      };
      return qb;
    },
  };
  return { repo: repo as unknown as Repository<InvoiceItemEntity>, calls };
}

const line = (
  invoiceId: string,
  direction: ItemDirection,
  lineDiscount: number,
  promotionDiscount = 0,
): FakeLine => ({ invoiceId, direction, lineDiscount, promotionDiscount });

describe('loadSignedLineDiscounts', () => {
  it('returns an empty map and never touches the database for an empty id list', async () => {
    const { repo, calls } = fakeRepo([line('i1', ItemDirection.OUT, 100)]);

    const result = await loadSignedLineDiscounts(repo, []);

    expect(result.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('sums OUT lines positively, adding manual and promotion discounts together', async () => {
    const { repo } = fakeRepo([
      line('i1', ItemDirection.OUT, 50_000),
      line('i1', ItemDirection.OUT, 0, 150_000),
    ]);

    const result = await loadSignedLineDiscounts(repo, ['i1']);

    expect(result.get('i1')).toBe(200_000);
  });

  it('sums IN lines negatively — a return reverses the original promotion', async () => {
    const { repo } = fakeRepo([line('i1', ItemDirection.IN, 0, 150_000)]);

    const result = await loadSignedLineDiscounts(repo, ['i1']);

    expect(result.get('i1')).toBe(-150_000);
  });

  it('nets an EXCHANGE that has both legs', async () => {
    // The shape of RTN-202608-00022: new goods carry no promotion, the returned
    // line carries the 150.000 being reversed.
    const { repo } = fakeRepo([
      line('i1', ItemDirection.OUT, 0, 0),
      line('i1', ItemDirection.IN, 0, 150_000),
    ]);

    const result = await loadSignedLineDiscounts(repo, ['i1']);

    expect(result.get('i1')).toBe(-150_000);
  });

  it('omits an invoice that has no lines rather than mapping it to zero', async () => {
    const { repo } = fakeRepo([line('i1', ItemDirection.OUT, 100)]);

    const result = await loadSignedLineDiscounts(repo, ['i1', 'i2']);

    expect(result.get('i1')).toBe(100);
    expect(result.has('i2')).toBe(false);
  });

  it('keeps invoices apart', async () => {
    const { repo } = fakeRepo([
      line('i1', ItemDirection.OUT, 100),
      line('i2', ItemDirection.IN, 70),
    ]);

    const result = await loadSignedLineDiscounts(repo, ['i1', 'i2']);

    expect(result.get('i1')).toBe(100);
    expect(result.get('i2')).toBe(-70);
  });

  it('chunks large id lists and merges the chunks', async () => {
    const ids = Array.from({ length: 20_001 }, (_, i) => `i${i}`);
    const { repo, calls } = fakeRepo([
      line('i0', ItemDirection.OUT, 10),
      line('i20000', ItemDirection.OUT, 20),
    ]);

    const result = await loadSignedLineDiscounts(repo, ids);

    expect(calls).toHaveLength(2);
    expect(result.get('i0')).toBe(10);
    expect(result.get('i20000')).toBe(20);
  });
});
