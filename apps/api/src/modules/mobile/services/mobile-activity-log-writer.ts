import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** Thư mục mặc định, tương đối với `cwd` của process (PM2 đặt `cwd` = `apps/api`). */
const DEFAULT_DIR = 'logs/activity';

/** Số ngày giữ file log. `0` = giữ mãi. */
const DEFAULT_RETENTION_DAYS = 90;

const FILE_PATTERN = /^activity-(\d{4}-\d{2}-\d{2})\.log$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ghi activity ra file JSON lines, xoay theo NGÀY UTC bằng tên file
 * (`activity-YYYY-MM-DD.log`) — không cần thư viện rotation.
 *
 * **Một `WriteStream` cho ngày hiện tại**, giữ mở suốt ngày, thay vì mở/đóng
 * file ở mỗi request: bớt syscall và bớt việc cho thread pool của Node (dùng
 * chung với mọi I/O khác của API).
 *
 * **Mọi thao tác xếp hàng qua [queue]** — đổi ngày, ghi, đóng. Nhờ vậy một batch
 * luôn ghi trọn trước batch sau (không xen dòng), và không có hai lượt cùng mở
 * stream cho ngày mới.
 *
 * **Dọn file cũ** mỗi lần mở file của một ngày mới (kể cả lần đầu sau khởi
 * động): xoá `activity-*.log` cũ hơn `ACTIVITY_LOG_RETENTION_DAYS` ngày. Không
 * nén — giữ đơn giản.
 *
 * API đang chạy PM2 `fork` một instance nên không có hai process tranh cùng
 * file. Ngày chuyển sang `cluster` thì phải thêm pid vào tên file.
 *
 * Tách khỏi `MobileActivityService` để test service không chạm đĩa.
 */
@Injectable()
export class MobileActivityLogWriter implements OnModuleDestroy {
  private readonly logger = new Logger(MobileActivityLogWriter.name);
  private readonly dir: string;
  private readonly retentionDays: number;

  private queue: Promise<void> = Promise.resolve();
  private stream: WriteStream | null = null;
  private streamDay: string | null = null;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('ACTIVITY_LOG_DIR') || DEFAULT_DIR;
    // Bỏ trống (kể cả `KEY=` rỗng trong .env) = mặc định; `Number('')` là 0,
    // tức "giữ mãi" — không được lẫn hai nghĩa đó.
    const raw = config.get<string>('ACTIVITY_LOG_RETENTION_DAYS')?.toString().trim();
    const retention = raw ? Number(raw) : NaN;
    this.retentionDays =
      Number.isInteger(retention) && retention >= 0 ? retention : DEFAULT_RETENTION_DAYS;
  }

  static fileNameOf(at: Date): string {
    return `activity-${at.toISOString().slice(0, 10)}.log`;
  }

  /** Ném khi ghi hỏng — service để lỗi nổi lên thành 500 và app giữ lại batch. */
  append(lines: string[], at: Date): Promise<void> {
    if (lines.length === 0) return Promise.resolve();
    return this.enqueue(() => this.write(`${lines.join('\n')}\n`, at));
  }

  async onModuleDestroy(): Promise<void> {
    await this.enqueue(() => this.closeStream());
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    // Hàng đợi không được kẹt vì một lượt hỏng; lỗi vẫn trả về cho người gọi.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(data: string, at: Date): Promise<void> {
    const stream = await this.streamFor(at);

    try {
      await new Promise<void>((resolve, reject) =>
        stream.write(data, (error) => (error ? reject(error) : resolve())),
      );
    } catch (error) {
      // Stream hỏng thì bỏ, lượt sau mở lại từ đầu.
      stream.destroy();
      this.stream = null;
      this.streamDay = null;
      throw error;
    }
  }

  private async streamFor(at: Date): Promise<WriteStream> {
    const day = at.toISOString().slice(0, 10);
    if (this.stream && this.streamDay === day) return this.stream;

    await this.closeStream();
    await mkdir(this.dir, { recursive: true });

    const stream = createWriteStream(join(this.dir, MobileActivityLogWriter.fileNameOf(at)), {
      flags: 'a',
      encoding: 'utf8',
    });
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', reject);
    });
    // Lỗi phát SAU khi đã mở (đĩa đầy...) không được làm sập process.
    stream.on('error', (error) => this.logger.error(`Activity log stream error: ${error.message}`));

    this.stream = stream;
    this.streamDay = day;

    await this.removeExpired(at);
    return stream;
  }

  private async closeStream(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    this.streamDay = null;
    if (!stream || stream.destroyed) return;

    await new Promise<void>((resolve) => stream.end(() => resolve()));
  }

  /** Dọn file quá hạn. Hỏng thì chỉ log — không được chặn việc ghi. */
  private async removeExpired(now: Date): Promise<void> {
    if (this.retentionDays === 0) return;

    const cutoff = new Date(now.getTime() - this.retentionDays * DAY_MS).toISOString().slice(0, 10);
    try {
      for (const name of await readdir(this.dir)) {
        const day = FILE_PATTERN.exec(name)?.[1];
        if (day && day < cutoff) await unlink(join(this.dir, name));
      }
    } catch (error) {
      this.logger.warn(`Không dọn được activity log cũ: ${(error as Error).message}`);
    }
  }
}
