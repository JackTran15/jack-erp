import { DataSource, QueryRunner } from 'typeorm';
import { ProvinceMergedFrom } from './province.entity';

/** Một dòng trong `migrations/data/geo-<năm>/provinces.json` (đầu ra của `convert-web-gateway-dumps.mjs`). */
export interface ProvinceSeed {
  code: string;
  name: string;
  isActive: boolean;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  mergedFrom: ProvinceMergedFrom[];
}

/** Một dòng trong `migrations/data/geo-<năm>/wards.json`. */
export interface WardSeed {
  code: string;
  name: string;
  provinceCode: string;
  districtCode: string | null;
}

export interface GeoDataset {
  provinces: ProvinceSeed[];
  wards: WardSeed[];
}

export interface GeoDatasetLoadResult {
  provinces: number;
  wards: number;
  /** Số phường có `province_code` nằm trong `geo_provinces` sau khi nạp. */
  current: number;
}

const WARD_BATCH_SIZE = 1000;

/**
 * Upsert bộ dữ liệu tỉnh/phường vào `geo_provinces` / `geo_wards`. Idempotent —
 * chạy lại trên DB đã nạp không đổi số dòng. Nhận `QueryRunner` (migration) hoặc
 * `DataSource` (e2e sau `resetDatabase()`) nên không phụ thuộc Nest DI; ADR-01.
 *
 * `is_current` được tính lại ở cuối = `province_code IN (SELECT code FROM geo_provinces)`,
 * không suy từ tiền tố năm — dump đợt sau (`2030_xx`) vẫn đúng.
 *
 * Chỉ upsert, không xoá: một migration `LoadGeoDataset<năm>` sau này thay cả bộ tỉnh
 * phải `DELETE FROM geo_provinces` các mã bị thay thế **trước** khi gọi hàm này, nếu
 * không hai thời kỳ cùng `is_current = true` và mã phường hết duy nhất trong bộ hiện hành.
 */
export async function upsertGeoDataset(
  runner: QueryRunner | DataSource,
  dataset: GeoDataset,
): Promise<GeoDatasetLoadResult> {
  if (dataset.provinces.length > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    dataset.provinces.forEach((p, i) => {
      const base = i * 5;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb)`);
      params.push(p.code, p.name, p.isActive, p.effectiveFrom, JSON.stringify(p.mergedFrom));
    });
    await runner.query(
      `INSERT INTO "geo_provinces" ("code", "name", "is_active", "effective_from", "merged_from")
       VALUES ${values.join(', ')}
       ON CONFLICT ("code") DO UPDATE SET
         "name" = EXCLUDED."name",
         "is_active" = EXCLUDED."is_active",
         "effective_from" = EXCLUDED."effective_from",
         "merged_from" = EXCLUDED."merged_from",
         "updated_at" = now()`,
      params,
    );
  }

  for (let start = 0; start < dataset.wards.length; start += WARD_BATCH_SIZE) {
    const batch = dataset.wards.slice(start, start + WARD_BATCH_SIZE);
    const values: string[] = [];
    const params: unknown[] = [];
    batch.forEach((w, i) => {
      const base = i * 4;
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      params.push(w.code, w.name, w.provinceCode, w.districtCode);
    });
    await runner.query(
      `INSERT INTO "geo_wards" ("code", "name", "province_code", "district_code")
       VALUES ${values.join(', ')}
       ON CONFLICT ("province_code", "code") DO UPDATE SET
         "name" = EXCLUDED."name",
         "district_code" = EXCLUDED."district_code",
         "updated_at" = now()`,
      params,
    );
  }

  await runner.query(
    `UPDATE "geo_wards" SET "is_current" = ("province_code" IN (SELECT "code" FROM "geo_provinces"))
     WHERE "is_current" IS DISTINCT FROM ("province_code" IN (SELECT "code" FROM "geo_provinces"))`,
  );

  const [row] = (await runner.query(
    `SELECT
       (SELECT count(*) FROM "geo_provinces")::int AS "provinces",
       (SELECT count(*) FROM "geo_wards")::int AS "wards",
       (SELECT count(*) FROM "geo_wards" WHERE "is_current")::int AS "current"`,
  )) as GeoDatasetLoadResult[];
  return row;
}
