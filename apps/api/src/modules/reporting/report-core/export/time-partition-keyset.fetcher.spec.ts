import { ReportRow } from '@erp/shared-interfaces';
import {
  FetchPageArgs,
  FetchPageResult,
  KeysetCursor,
  TimePartition,
} from './export.types';
import { TimePartitionKeysetFetcher } from './time-partition-keyset.fetcher';

/** One source record, as a keyset-paginated table would hold it. */
interface Record {
  id: string;
  at: string;
  amount: number;
}

const PARTITIONS: TimePartition[] = [
  { from: new Date('2026-01-22'), to: new Date('2026-02-01') },
  { from: new Date('2026-01-15'), to: new Date('2026-01-22') },
  { from: new Date('2026-01-08'), to: new Date('2026-01-15') },
  { from: new Date('2026-01-01'), to: new Date('2026-01-08') },
];

const COLUMNS = ['id', 'at', 'amount'];
const SUMMABLE = ['amount'];

/**
 * A fake source that behaves like the real keyset query: filters by the
 * half-open window, orders by `(at DESC, id DESC)`, and pages by cursor.
 */
function makeSource(records: Record[]) {
  const calls: { partition: TimePartition; cursor: KeysetCursor | null }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const fetch = async (args: FetchPageArgs): Promise<FetchPageResult> => {
    calls.push({ partition: args.partition, cursor: args.cursor });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    // Yield, so overlapping drains actually overlap in the test.
    await new Promise((resolve) => setImmediate(resolve));
    inFlight--;

    const { from, to } = args.partition;
    const inWindow = records.filter(
      (r) =>
        (!from || new Date(r.at) >= from) && (!to || new Date(r.at) < to),
    );
    const ordered = [...inWindow].sort((a, b) =>
      a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at),
    );
    const after = args.cursor
      ? ordered.filter(
          (r) =>
            r.at < args.cursor!.at ||
            (r.at === args.cursor!.at && r.id < args.cursor!.id),
        )
      : ordered;
    const page = after.slice(0, args.size);
    const last = page[page.length - 1];

    return {
      rows: page.map((r) => ({ ...r }) as ReportRow),
      nextCursor: last ? { at: last.at, id: last.id } : null,
      hasMore: page.length === args.size,
    };
  };

  return { fetch, calls, maxInFlight: () => maxInFlight };
}

function records(count: number, at = '2026-01-05T00:00:00.000Z'): Record[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${String(i).padStart(4, '0')}`,
    at,
    amount: 1,
  }));
}

async function collect(
  fetcher: TimePartitionKeysetFetcher,
): Promise<{ rows: ReportRow[]; batches: number; totals: ReportRow | null }> {
  const rows: ReportRow[] = [];
  let batches = 0;
  const totals = await fetcher.drain(async (batch) => {
    batches++;
    rows.push(...batch);
  });
  return { rows, batches, totals };
}

describe('TimePartitionKeysetFetcher', () => {
  it('refuses a parallelism below one', () => {
    expect(
      () =>
        new TimePartitionKeysetFetcher({
          partitions: PARTITIONS,
          parallel: 0,
          columns: COLUMNS,
          summable: SUMMABLE,
          fetch: async () => ({ rows: [], nextCursor: null, hasMore: false }),
        }),
    ).toThrow(/parallel/);
  });

  it('returns nothing for an empty partition list', async () => {
    const source = makeSource([]);
    const totals = await new TimePartitionKeysetFetcher({
      partitions: [],
      parallel: 3,
      columns: COLUMNS,
      summable: SUMMABLE,
      fetch: source.fetch,
    }).drain(async () => undefined);

    expect(totals).toBeNull();
    expect(source.calls).toHaveLength(0);
  });

  it('pages a window by cursor and returns every row exactly once', async () => {
    const all = records(25);
    const source = makeSource(all);

    const { rows } = await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 2,
        columns: COLUMNS,
        summable: SUMMABLE,
        batchSize: 4,
        fetch: source.fetch,
      }),
    );

    expect(rows).toHaveLength(25);
    expect(new Set(rows.map((r) => r.id)).size).toBe(25);
  });

  it('does not repeat or lose rows that share a timestamp', async () => {
    // Every record has the identical `at`, so `id` is the only thing keeping
    // the cursor moving. This is the case OFFSET pagination gets wrong.
    const all = records(13, '2026-01-05T10:00:00.000000Z');
    const source = makeSource(all);

    const { rows } = await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 4,
        columns: COLUMNS,
        summable: SUMMABLE,
        batchSize: 3,
        fetch: source.fetch,
      }),
    );

    expect(rows.map((r) => r.id).sort()).toEqual(all.map((r) => r.id).sort());
  });

  it('emits rows in partition order even when later windows finish first', async () => {
    // Newest window is slow, oldest is instant: without ordered flushing the
    // file would come out with January 1st above January 30th.
    const all = [
      { id: 'new-1', at: '2026-01-30T00:00:00.000Z', amount: 1 },
      { id: 'old-1', at: '2026-01-02T00:00:00.000Z', amount: 1 },
    ];
    const source = makeSource(all);
    const slowFetch = async (args: FetchPageArgs): Promise<FetchPageResult> => {
      const isNewest = args.partition.from?.getTime() === PARTITIONS[0].from!.getTime();
      if (isNewest) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return source.fetch(args);
    };

    const { rows } = await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 4,
        columns: COLUMNS,
        summable: SUMMABLE,
        fetch: slowFetch,
      }),
    );

    expect(rows.map((r) => r.id)).toEqual(['new-1', 'old-1']);
  });

  it('runs one window at a time at parallel: 1', async () => {
    const source = makeSource(records(10));

    await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 1,
        columns: COLUMNS,
        summable: SUMMABLE,
        batchSize: 2,
        fetch: source.fetch,
      }),
    );

    expect(source.maxInFlight()).toBe(1);
  });

  it('holds several windows open at parallel: 3', async () => {
    const spread = [
      { id: 'a', at: '2026-01-30T00:00:00.000Z', amount: 1 },
      { id: 'b', at: '2026-01-20T00:00:00.000Z', amount: 1 },
      { id: 'c', at: '2026-01-10T00:00:00.000Z', amount: 1 },
      { id: 'd', at: '2026-01-02T00:00:00.000Z', amount: 1 },
    ];
    const source = makeSource(spread);

    await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 3,
        columns: COLUMNS,
        summable: SUMMABLE,
        fetch: source.fetch,
      }),
    );

    expect(source.maxInFlight()).toBeGreaterThan(1);
    expect(source.maxInFlight()).toBeLessThanOrEqual(3);
  });

  it('never buffers past the high-water mark', async () => {
    // The flush head (window 0) is slow and small; the three windows behind it
    // are instant and large, so they race ahead and would hold ~900 rows in
    // memory if nothing stopped them. This is the case bufferHighWater exists
    // for — a test where the big window is the flush head proves nothing,
    // because the flush head is deliberately exempt from backpressure.
    const all = [
      ...records(5, '2026-01-30T00:00:00.000Z'),
      ...records(300, '2026-01-18T00:00:00.000Z'),
      ...records(300, '2026-01-11T00:00:00.000Z'),
      ...records(300, '2026-01-03T00:00:00.000Z'),
    ].map((r, i) => ({ ...r, id: `id-${String(i).padStart(4, '0')}` }));
    const source = makeSource(all);
    const highWater = 100;
    const batchSize = 10;

    let fetched = 0;
    let pushed = 0;
    let peakBuffered = 0;
    const rows: ReportRow[] = [];

    await new TimePartitionKeysetFetcher({
      partitions: PARTITIONS,
      parallel: 4,
      columns: COLUMNS,
      summable: SUMMABLE,
      batchSize,
      bufferHighWater: highWater,
      fetch: async (args) => {
        const isHead = args.partition.from?.getTime() === PARTITIONS[0].from!.getTime();
        if (isHead) await new Promise((resolve) => setTimeout(resolve, 15));
        const page = await source.fetch(args);
        fetched += page.rows.length;
        // Rows fetched but not yet pushed downstream: exactly what the mark bounds.
        peakBuffered = Math.max(peakBuffered, fetched - pushed);
        return page;
      },
    }).drain(async (batch) => {
      pushed += batch.length;
      rows.push(...batch);
    });

    expect(rows).toHaveLength(905);
    // One in-flight page per running window may land after the check, hence
    // the slack; without backpressure this peaks near 900.
    expect(peakBuffered).toBeLessThanOrEqual(highWater + batchSize * 4);
  });

  it('sums only the summable columns and shapes totals like a row', async () => {
    const all = [
      { id: 'a', at: '2026-01-30T00:00:00.000Z', amount: 1000.5 },
      { id: 'b', at: '2026-01-02T00:00:00.000Z', amount: 2000.25 },
    ];
    const source = makeSource(all);

    const { totals } = await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 2,
        columns: COLUMNS,
        summable: SUMMABLE,
        fetch: source.fetch,
      }),
    );

    expect(totals).toEqual({ id: null, at: null, amount: 3000.75 });
  });

  it('returns null totals when nothing matched', async () => {
    const source = makeSource([]);

    const { totals, rows } = await collect(
      new TimePartitionKeysetFetcher({
        partitions: PARTITIONS,
        parallel: 2,
        columns: COLUMNS,
        summable: SUMMABLE,
        fetch: source.fetch,
      }),
    );

    expect(rows).toHaveLength(0);
    expect(totals).toBeNull();
  });

  it('stops at a page that returns no cursor, whatever hasMore claims', async () => {
    let calls = 0;
    const fetcher = new TimePartitionKeysetFetcher({
      partitions: [PARTITIONS[0]],
      parallel: 1,
      columns: COLUMNS,
      summable: SUMMABLE,
      fetch: async () => {
        calls++;
        return {
          rows: [{ id: 'a', at: '2026-01-30', amount: 1 }],
          nextCursor: null,
          hasMore: true,
        };
      },
    });

    await collect(fetcher);

    expect(calls).toBe(1);
  });

  it('propagates a failing window instead of writing a short file', async () => {
    const source = makeSource(records(10, '2026-01-30T00:00:00.000Z'));
    const fetcher = new TimePartitionKeysetFetcher({
      partitions: PARTITIONS,
      parallel: 2,
      columns: COLUMNS,
      summable: SUMMABLE,
      fetch: async (args) => {
        if (args.partition.from?.getTime() === PARTITIONS[1].from!.getTime()) {
          throw new Error('partition query failed');
        }
        return source.fetch(args);
      },
    });

    await expect(collect(fetcher)).rejects.toThrow('partition query failed');
  });

  it('fails a page that runs past the batch timeout', async () => {
    const fetcher = new TimePartitionKeysetFetcher({
      partitions: [PARTITIONS[0]],
      parallel: 1,
      columns: COLUMNS,
      summable: SUMMABLE,
      batchTimeoutMs: 20,
      fetch: () => new Promise(() => undefined),
    });

    await expect(collect(fetcher)).rejects.toThrow(/timed out after 20ms/);
  });
});
