import { ReportRow } from '@erp/shared-interfaces';
import { Logger } from '@nestjs/common';
import {
  ExportFetcher,
  FetchPageArgs,
  FetchPageResult,
  KeysetCursor,
  PushRows,
  TimePartition,
} from './export.types';

/**
 * Drains each time window by keyset cursor, several windows at a time, and
 * pushes rows in window order so the file stays globally sorted (ADR-07).
 *
 * Keyset instead of OFFSET because OFFSET makes the database count and discard
 * every earlier row on each page, and because rows shift between pages when
 * something is inserted mid-export — a row gets exported twice, or not at all.
 *
 * Memory is bounded by `bufferHighWater`, not by the size of the report. The
 * window currently being flushed streams straight through as its pages arrive;
 * the windows running ahead of it buffer, and pause once the buffered rows
 * reach the high-water mark. At `parallel: 1` nothing runs ahead, so nothing
 * buffers at all.
 */

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_BUFFER_HIGH_WATER = 20_000;
const DEFAULT_BATCH_TIMEOUT_MS = 30_000;

export interface TimePartitionKeysetOptions {
  partitions: TimePartition[];
  /** Windows drained at once — also the peak DB connections one export holds. */
  parallel: number;
  /** Every requested column, so the totals row has the same keys as the data. */
  columns: string[];
  /** The subset of `columns` whose running sum is meaningful. */
  summable: string[];
  batchSize?: number;
  bufferHighWater?: number;
  batchTimeoutMs?: number;
  fetch(args: FetchPageArgs): Promise<FetchPageResult>;
}

/** A one-shot broadcast: everyone waiting is released on the next notify. */
class Signal {
  private waiters: (() => void)[] = [];

  wait(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  notify(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}

export class TimePartitionKeysetFetcher implements ExportFetcher {
  private readonly logger = new Logger(TimePartitionKeysetFetcher.name);
  private readonly partitions: TimePartition[];
  private readonly parallel: number;
  private readonly columns: string[];
  private readonly summable: Set<string>;
  private readonly batchSize: number;
  private readonly bufferHighWater: number;
  private readonly batchTimeoutMs: number;
  private readonly fetchPage: TimePartitionKeysetOptions['fetch'];

  constructor(options: TimePartitionKeysetOptions) {
    if (options.parallel <= 0) {
      throw new Error('TimePartitionKeysetFetcher parallel must be at least 1');
    }
    this.partitions = options.partitions;
    this.parallel = options.parallel;
    this.columns = options.columns;
    this.summable = new Set(options.summable);
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.bufferHighWater = options.bufferHighWater ?? DEFAULT_BUFFER_HIGH_WATER;
    this.batchTimeoutMs = options.batchTimeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS;
    this.fetchPage = options.fetch;
  }

  async drain(push: PushRows): Promise<ReportRow | null> {
    const count = this.partitions.length;
    if (count === 0) return null;

    const buffers: ReportRow[][] = this.partitions.map(() => []);
    const finished: boolean[] = this.partitions.map(() => false);
    /** Rows appended or a drain finished. */
    const progress = new Signal();
    /** Buffered rows were pushed downstream, so capacity freed. */
    const freed = new Signal();

    let buffered = 0;
    let flushIndex = 0;
    let failure: unknown;
    let rowsPushed = 0;
    const sums = new Map<string, number>();

    const drainPartition = async (index: number): Promise<void> => {
      let cursor: KeysetCursor | null = null;
      let hasMore = true;
      let pages = 0;

      while (hasMore && failure === undefined) {
        const page: FetchPageResult = await this.withTimeout(
          this.fetchPage({
            partition: this.partitions[index],
            cursor,
            size: this.batchSize,
          }),
          `keyset page timed out after ${this.batchTimeoutMs}ms ` +
            `(partition ${index}, page ${pages + 1})`,
        );
        pages++;

        if (page.rows.length) {
          buffers[index].push(...page.rows);
          buffered += page.rows.length;
          progress.notify();
        }

        cursor = page.nextCursor;
        // A page that came back short is the last one; a cursor-less page has
        // nowhere to continue from even if the source claims otherwise.
        hasMore = page.hasMore && cursor !== null;

        // Backpressure — but never hold up the window being flushed, or the
        // flush loop would be waiting on a drain that is waiting on the flush.
        while (
          buffered >= this.bufferHighWater &&
          index !== flushIndex &&
          failure === undefined
        ) {
          await freed.wait();
        }
      }

      this.logger.log(
        `keyset partition #${index} drained — pages=${pages} rows=${buffers[index].length}`,
      );
    };

    const started: Promise<void>[] = [];
    const startDrain = (index: number): void => {
      const running = drainPartition(index)
        .catch((error: unknown) => {
          // Record and wake everyone: a look-ahead window that dies must not
          // leave the flush loop waiting for rows that will never come.
          failure ??= error;
        })
        .finally(() => {
          finished[index] = true;
          progress.notify();
          freed.notify();
        });
      started.push(running);
    };

    let launched = 0;
    for (; launched < Math.min(this.parallel, count); launched++) {
      startDrain(launched);
    }

    try {
      for (let index = 0; index < count; index++) {
        flushIndex = index;
        // This window may have been parked on backpressure while it was still
        // running ahead; it is the flush head now, so let it run.
        freed.notify();

        while (!finished[index] || buffers[index].length) {
          if (failure !== undefined) throw failure;

          if (buffers[index].length) {
            const batch = buffers[index].splice(0, buffers[index].length);
            buffered -= batch.length;
            this.accumulate(sums, batch);
            rowsPushed += batch.length;
            await push(batch);
            freed.notify();
          } else {
            await progress.wait();
          }
        }
        if (failure !== undefined) throw failure;

        if (launched < count) startDrain(launched++);
      }
    } finally {
      // Let every drain settle before returning or rethrowing, so no query
      // outlives the request that started it.
      await Promise.allSettled(started);
    }

    return rowsPushed ? this.totalsRow(sums) : null;
  }

  private accumulate(sums: Map<string, number>, rows: ReportRow[]): void {
    for (const column of this.summable) {
      let sum = sums.get(column) ?? 0;
      for (const row of rows) sum += Number(row[column] ?? 0);
      sums.set(column, sum);
    }
  }

  /** Same shape as a data row: non-summable columns carry null, not a wrong sum. */
  private totalsRow(sums: Map<string, number>): ReportRow {
    const totals: ReportRow = {};
    for (const column of this.columns) {
      const sum = sums.get(column);
      totals[column] = sum === undefined ? null : Math.round(sum * 100) / 100;
    }
    return totals;
  }

  private withTimeout<T>(work: Promise<T>, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), this.batchTimeoutMs);
    });
    return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
  }
}
