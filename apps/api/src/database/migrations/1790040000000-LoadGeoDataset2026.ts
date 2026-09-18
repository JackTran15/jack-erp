import { readFileSync } from 'fs';
import * as path from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { upsertGeoDataset } from '../../modules/geo/geo-dataset.loader';

/**
 * Nạp bộ dữ liệu tỉnh/phường 2026 (35 tỉnh, 14 428 phường — 3 321 hiện hành,
 * 11 107 cũ) vào `geo_provinces` / `geo_wards`. Dữ liệu là hai file JSON bất
 * biến cạnh migration (`data/geo-2026/`), sinh từ dump `web_gateway` bằng
 * `apps/api/scripts/geo/convert-web-gateway-dumps.mjs`. Dump đợt sau = thư mục
 * `data/geo-<năm>/` mới + một migration mới gọi cùng `upsertGeoDataset()`.
 *
 * Migration luôn chạy qua ts-node từ `src` (`typeorm-ts-node-commonjs -d
 * src/database/data-source.ts`) nên đọc file theo `__dirname` là đủ (A-09).
 */
export class LoadGeoDataset20261790040000000 implements MigrationInterface {
  name = 'LoadGeoDataset20261790040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dir = path.join(__dirname, 'data', 'geo-2026');
    const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as T;
    const result = await upsertGeoDataset(queryRunner, {
      provinces: read('provinces.json'),
      wards: read('wards.json'),
    });
    console.log(
      `LoadGeoDataset2026: ${result.provinces} provinces, ${result.wards} wards (${result.current} current)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`TRUNCATE TABLE "geo_wards", "geo_provinces"`);
  }
}
