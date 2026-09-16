import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MobileActivityLogWriter } from './mobile-activity-log-writer';

function writerFor(dir: string, retentionDays?: string): MobileActivityLogWriter {
  const env: Record<string, string | undefined> = {
    ACTIVITY_LOG_DIR: dir,
    ACTIVITY_LOG_RETENTION_DAYS: retentionDays,
  };
  return new MobileActivityLogWriter({ get: (key: string) => env[key] } as unknown as ConfigService);
}

/** Ghi thật lên thư mục tạm: thứ đang khoá là hành vi của stream và của đĩa. */
describe('MobileActivityLogWriter', () => {
  let dir: string;
  let writer: MobileActivityLogWriter;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'activity-log-'));
  });

  afterEach(async () => {
    await writer?.onModuleDestroy();
    await rm(dir, { recursive: true, force: true });
  });

  const day1 = new Date('2026-09-16T10:00:00.000Z');

  it('nhiều batch đồng thời: đủ dòng, không xen, mỗi dòng parse được', async () => {
    writer = writerFor(dir);
    const batches = Array.from({ length: 50 }, (_, b) =>
      Array.from({ length: 100 }, (_, i) => JSON.stringify({ b, i, pad: 'x'.repeat(300) })),
    );

    await Promise.all(batches.map((lines) => writer.append(lines, day1)));
    await writer.onModuleDestroy();

    const lines = (await readFile(join(dir, 'activity-2026-09-16.log'), 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(5000);
    const parsed = lines.map((line) => JSON.parse(line) as { b: number; i: number });
    // Mỗi batch nằm liền một khối, đúng thứ tự trong batch.
    for (let b = 0; b < 50; b++) {
      const block = parsed.slice(b * 100, (b + 1) * 100);
      expect(new Set(block.map((row) => row.b)).size).toBe(1);
      expect(block.map((row) => row.i)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    }
  });

  it('sang ngày UTC mới thì ghi file mới', async () => {
    writer = writerFor(dir);
    await writer.append(['{"a":1}'], new Date('2026-09-16T23:59:59.999Z'));
    await writer.append(['{"a":2}'], new Date('2026-09-17T00:00:00.000Z'));
    await writer.onModuleDestroy();

    expect(await readFile(join(dir, 'activity-2026-09-16.log'), 'utf8')).toBe('{"a":1}\n');
    expect(await readFile(join(dir, 'activity-2026-09-17.log'), 'utf8')).toBe('{"a":2}\n');
  });

  it('ghi nối vào file đã có (process khởi động lại giữa ngày)', async () => {
    await writeFile(join(dir, 'activity-2026-09-16.log'), '{"old":true}\n');
    writer = writerFor(dir);
    await writer.append(['{"new":true}'], day1);
    await writer.onModuleDestroy();

    expect(await readFile(join(dir, 'activity-2026-09-16.log'), 'utf8')).toBe('{"old":true}\n{"new":true}\n');
  });

  it('xoá file quá hạn, giữ file trong hạn và file lạ', async () => {
    for (const name of ['activity-2026-06-17.log', 'activity-2026-06-18.log', 'notes.txt']) {
      await writeFile(join(dir, name), 'x\n');
    }
    writer = writerFor(dir, '90');
    await writer.append(['{}'], day1); // cutoff = 2026-06-18

    expect((await readdir(dir)).sort()).toEqual(['activity-2026-06-18.log', 'activity-2026-09-16.log', 'notes.txt']);
  });

  it('retention rỗng thì dùng mặc định 90 ngày, không hiểu nhầm thành 0', async () => {
    await writeFile(join(dir, 'activity-2020-01-01.log'), 'x\n');
    writer = writerFor(dir, '');
    await writer.append(['{}'], day1);

    expect(await readdir(dir)).not.toContain('activity-2020-01-01.log');
  });

  it('retention 0 thì không xoá gì', async () => {
    await writeFile(join(dir, 'activity-2020-01-01.log'), 'x\n');
    writer = writerFor(dir, '0');
    await writer.append(['{}'], day1);

    expect(await readdir(dir)).toContain('activity-2020-01-01.log');
  });

  it('fileNameOf xoay theo ngày UTC', () => {
    expect(MobileActivityLogWriter.fileNameOf(new Date('2026-09-16T23:59:59.999Z'))).toBe('activity-2026-09-16.log');
    expect(MobileActivityLogWriter.fileNameOf(new Date('2026-09-17T00:00:00.000Z'))).toBe('activity-2026-09-17.log');
  });
});
