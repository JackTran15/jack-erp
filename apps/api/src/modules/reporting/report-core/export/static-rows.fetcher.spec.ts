import { StaticRowsFetcher } from './static-rows.fetcher';

describe('StaticRowsFetcher', () => {
  it('pushes all rows exactly once and returns the given totals', async () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const totals = { a: 3 };
    const pushed: unknown[][] = [];

    const result = await new StaticRowsFetcher(rows, totals).drain(async (batch) => {
      pushed.push(batch);
    });

    expect(pushed).toEqual([rows]);
    expect(result).toBe(totals);
  });

  it('does not push when there are no rows, but still returns totals', async () => {
    const push = jest.fn();
    const result = await new StaticRowsFetcher([], null).drain(push);

    expect(push).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
