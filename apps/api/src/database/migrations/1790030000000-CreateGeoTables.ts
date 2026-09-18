import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `geo_provinces` + `geo_wards` — dữ liệu tỉnh/thành và phường/xã
 * (feature 2026091801-province-ward-lookup, ADR-01). Bảng toàn cục, không
 * org-scoped, không soft-delete. Dữ liệu được nạp bởi migration kế tiếp
 * (`LoadGeoDataset2026`) qua `upsertGeoDataset()`; e2e nạp lại bằng cùng hàm.
 *
 * Không FK từ wards sang provinces: phường cũ trỏ tới mã `1995_xx` không có
 * dòng tỉnh (chỉ xuất hiện trong `merged_from`). Tên index/unique phải khớp
 * decorator trên entity để `synchronize(true)` (e2e) và `migration:generate`
 * cùng hình dạng.
 */
export class CreateGeoTables1790030000000 implements MigrationInterface {
  name = 'CreateGeoTables1790030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "geo_provinces" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code"           varchar(16) NOT NULL,
        "name"           varchar(100) NOT NULL,
        "is_active"      boolean NOT NULL DEFAULT true,
        "effective_from" date NOT NULL,
        "merged_from"    jsonb NOT NULL DEFAULT '[]',
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geo_provinces" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_geo_provinces_code" ON "geo_provinces" ("code")`,
    );

    await queryRunner.query(`
      CREATE TABLE "geo_wards" (
        "id"            uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code"          varchar(8) NOT NULL,
        "name"          varchar(100) NOT NULL,
        "province_code" varchar(16) NOT NULL,
        "district_code" varchar(8) NULL,
        "is_current"    boolean NOT NULL DEFAULT false,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geo_wards" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_geo_wards_province_code_code" ON "geo_wards" ("province_code", "code")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_geo_wards_is_current" ON "geo_wards" ("is_current")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_geo_wards_province_code" ON "geo_wards" ("province_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "geo_wards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "geo_provinces"`);
  }
}
