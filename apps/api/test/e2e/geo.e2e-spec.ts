import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { WardDto } from '../../src/modules/geo/dto/ward.dto';
import { upsertGeoDataset, GeoDataset } from '../../src/modules/geo/geo-dataset.loader';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

/**
 * Tra cứu tỉnh/thành và phường/xã — feature 2026091801-province-ward-lookup.
 *
 * `resetDatabase()` dựng lại schema bằng `synchronize(true)` nên dữ liệu do
 * migration `LoadGeoDataset2026` nạp không còn; spec nạp lại bằng đúng hàm
 * `upsertGeoDataset()` mà migration dùng (ADR-01), từ cùng hai file JSON.
 *
 * Số liệu kỳ vọng đo trên dump 2026-09-18 (xem 02-requirements.md).
 */

const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

// Vai chỉ có partner.catalog.read — KHÔNG có quyền nào về geo. Key trên vai
// này vẫn phải đọc được /v2/geo/* (ADR-03: ranh giới là AuthGuard, không phải
// PermissionGuard).
const PARTNER_ROLE_ID = 'd0000000-0000-4000-8000-000000000091';
const WHITELISTED_IP = '203.0.113.7';

const PROVINCES_URL = '/v2/geo/provinces';
const WARDS_URL = '/v2/geo/wards';

const DATASET_DIR = path.resolve(__dirname, '../../src/database/migrations/data/geo-2026');

function readDataset(): GeoDataset {
  const read = <T>(file: string): T =>
    JSON.parse(readFileSync(path.join(DATASET_DIR, file), 'utf8')) as T;
  return { provinces: read('provinces.json'), wards: read('wards.json') };
}

async function ensurePermission(ds: DataSource, key: string, module: string) {
  await ds.query(
    `INSERT INTO permissions (id, key, description, module)
     VALUES (gen_random_uuid(), $1, $1, $2) ON CONFLICT DO NOTHING`,
    [key, module],
  );
}

async function grantToRole(ds: DataSource, roleId: string, key: string) {
  await ds.query(
    `INSERT INTO role_permissions (id, role_id, permission_id)
     SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
     ON CONFLICT DO NOTHING`,
    [roleId, key],
  );
}

let app!: INestApplication;
let seed!: SeedResult;
let partnerKey!: string;

const jwtGet = (url: string) =>
  request(app.getHttpServer()).get(url).set('Authorization', authHeader(seed.accessToken));

const keyGet = (url: string) =>
  request(app.getHttpServer())
    .get(url)
    .set('X-Api-Key', partnerKey)
    .set('X-Forwarded-For', WHITELISTED_IP);

describe('Geo — tỉnh/thành và phường/xã (E2E)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    // `synchronize(true)` dựng bảng nhưng không tạo extension; môi trường thật
    // có `unaccent` từ migration 1782500000000-AddUnaccentExtension. Một DB
    // e2e tạo trước migration đó thiếu nó → mọi truy vấn tìm kiếm 500.
    await ds.query('CREATE EXTENSION IF NOT EXISTS unaccent');

    const loaded = await upsertGeoDataset(ds, readDataset());
    expect(loaded).toEqual({ provinces: 35, wards: 14428, current: 3321 });

    for (const key of ['api-key.read', 'api-key.create']) {
      await ensurePermission(ds, key, 'api-key');
      await grantToRole(ds, SEEDED_ROLE_ID, key);
    }
    await ensurePermission(ds, 'partner.catalog.read', 'partner-catalog');
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2, 'Đối tác', 'Partner integration role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, PARTNER_ROLE_ID, 'partner.catalog.read');
    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);

    const res = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ name: 'Geo partner key', roles: [PARTNER_ROLE_ID], ipWhitelist: [WHITELISTED_IP] })
      .expect(201);
    partnerKey = res.body.rawKey;
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('AC-11 — bộ dữ liệu sau khi nạp', () => {
    it('AC-11: 35 tỉnh, 14 428 phường (3 321 hiện hành / 11 107 cũ)', async () => {
      const ds = app.get(DataSource);
      const [row] = await ds.query(
        `SELECT (SELECT count(*) FROM geo_provinces)::int AS provinces,
                (SELECT count(*) FROM geo_wards)::int AS wards,
                (SELECT count(*) FROM geo_wards WHERE is_current)::int AS current,
                (SELECT count(*) FROM geo_wards WHERE NOT is_current)::int AS legacy`,
      );
      expect(row).toEqual({ provinces: 35, wards: 14428, current: 3321, legacy: 11107 });
    });
  });

  describe('US-01 — tra cứu tỉnh/thành', () => {
    it('AC-01: danh sách đủ 35 tỉnh, đủ field, thứ tự theo tên không dấu', async () => {
      const res = await jwtGet(PROVINCES_URL).expect(200);
      const data: Array<Record<string, unknown>> = res.body.data;
      expect(data).toHaveLength(35);
      for (const p of data) {
        expect(Object.keys(p).sort()).toEqual(
          ['code', 'effectiveFrom', 'isActive', 'mergedFrom', 'name'],
        );
        expect(p.effectiveFrom).toBe('2026-01-01');
        expect(p.isActive).toBe(true);
        expect(Array.isArray(p.mergedFrom)).toBe(true);
      }
      const names = data.map((p) => p.name as string);
      expect(names[0]).toBe('An Giang');
      expect(names.indexOf('Hà Nội')).toBeLessThan(names.indexOf('Hải Phòng'));
      // "Đà Nẵng" xếp trong nhóm D (unaccent đ → d), sau "Cao Bằng", trước "Điện Biên"
      expect(names.indexOf('Cao Bằng')).toBeLessThan(names.indexOf('Đà Nẵng'));
      expect(names.indexOf('Đà Nẵng')).toBeLessThan(names.indexOf('Điện Biên'));
    });

    it('AC-02: q không dấu khớp "Hà Nội"; % và _ là ký tự thường', async () => {
      const hit = await jwtGet(`${PROVINCES_URL}?q=ha%20noi`).expect(200);
      expect(hit.body.data.map((p: { code: string }) => p.code)).toEqual(['2026_01']);
      expect(hit.body.data[0].name).toBe('Hà Nội');

      const percent = await jwtGet(`${PROVINCES_URL}?q=%25`).expect(200);
      expect(percent.body.data).toEqual([]);
      const underscore = await jwtGet(`${PROVINCES_URL}?q=_`).expect(200);
      expect(underscore.body.data).toEqual([]);
      // q có dấu vẫn khớp
      const accented = await jwtGet(`${PROVINCES_URL}?q=${encodeURIComponent('Hồ Chí Minh')}`).expect(200);
      expect(accented.body.data.map((p: { code: string }) => p.code)).toEqual(['2026_79']);
    });

    it('AC-03: tra theo mã — 2026_79 có 3 mergedFrom, mã cũ 1995_02 → 404', async () => {
      const res = await jwtGet(`${PROVINCES_URL}/2026_79`).expect(200);
      expect(res.body.name).toBe('Tp. Hồ Chí Minh');
      expect(res.body.mergedFrom.map((m: { code: string }) => m.code).sort()).toEqual(
        ['1995_02', '1995_44', '1995_52'],
      );
      await jwtGet(`${PROVINCES_URL}/1995_02`).expect(404);
      await jwtGet(`${PROVINCES_URL}/nope`).expect(404);
    });

    it('AC-04 (provinces): 401 không credential; API key vai không có quyền geo vẫn 200, body giống JWT', async () => {
      await request(app.getHttpServer()).get(PROVINCES_URL).expect(401);
      await request(app.getHttpServer()).get(`${PROVINCES_URL}/2026_01`).expect(401);

      const viaJwt = await jwtGet(`${PROVINCES_URL}?q=ha%20noi`).expect(200);
      const viaKey = await keyGet(`${PROVINCES_URL}?q=ha%20noi`).expect(200);
      expect(viaKey.body).toEqual(viaJwt.body);

      const detailJwt = await jwtGet(`${PROVINCES_URL}/2026_79`).expect(200);
      const detailKey = await keyGet(`${PROVINCES_URL}/2026_79`).expect(200);
      expect(detailKey.body).toEqual(detailJwt.body);
    });

    it('AC-02 (hợp đồng DTO): field lạ trong query → 400', async () => {
      await jwtGet(`${PROVINCES_URL}?foo=1`).expect(400);
    });
  });

  describe('US-02 — tìm phường/xã', () => {
    const codes = (body: { data: WardDto[] }) => body.data.map((w) => w.code);

    it('AC-05: provinceCode=2026_01 → 126 phường hiện hành của Hà Nội, có provinceName, thứ tự không dấu', async () => {
      const res = await jwtGet(`${WARDS_URL}?provinceCode=2026_01&limit=100`).expect(200);
      expect(res.body.total).toBe(126);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(100);
      expect(res.body.data).toHaveLength(100);
      for (const w of res.body.data as WardDto[]) {
        expect(Object.keys(w).sort()).toEqual(
          ['code', 'districtCode', 'isCurrent', 'name', 'provinceCode', 'provinceName'],
        );
        expect(w.isCurrent).toBe(true);
        expect(w.districtCode).toBeNull();
        expect(w.provinceCode).toBe('2026_01');
        expect(w.provinceName).toBe('Hà Nội');
      }
      expect(res.body.data[0]).toMatchObject({ code: '4', name: 'Phường Ba Đình' });
      expect(res.body.data[1].name).toBe('Phường Bạch Mai');
    });

    it('AC-06: q=ba dinh không tỉnh → chỉ 3 phường hiện hành', async () => {
      const res = await jwtGet(`${WARDS_URL}?q=ba%20dinh`).expect(200);
      expect(res.body.total).toBe(3);
      expect(codes(res.body).sort()).toEqual(['16171', '21499', '4']);
      expect((res.body.data as WardDto[]).every((w) => w.isCurrent)).toBe(true);
    });

    it('AC-07: q=phuc xa → 0; includeLegacy=true → phường cũ Phúc Xá với districtCode, provinceName null', async () => {
      const none = await jwtGet(`${WARDS_URL}?q=phuc%20xa`).expect(200);
      expect(none.body.total).toBe(0);
      expect(none.body.data).toEqual([]);

      const legacy = await jwtGet(`${WARDS_URL}?q=phuc%20xa&includeLegacy=true`).expect(200);
      expect(legacy.body.total).toBe(1);
      expect(legacy.body.data).toEqual([
        {
          code: '001',
          name: 'Phường Phúc Xá',
          provinceCode: '1995_01',
          provinceName: null,
          districtCode: '01',
          isCurrent: false,
        },
      ]);
      // includeLegacy không phải boolean → 400, không im lặng coi là false
      await jwtGet(`${WARDS_URL}?q=phuc%20xa&includeLegacy=yes`).expect(400);
    });

    it('AC-08: provinceCode=1995_01 trả 583 phường cũ dù không includeLegacy', async () => {
      const res = await jwtGet(`${WARDS_URL}?provinceCode=1995_01&limit=100`).expect(200);
      expect(res.body.total).toBe(583);
      const rows = res.body.data as WardDto[];
      expect(rows).toHaveLength(100);
      expect(rows.every((w) => w.isCurrent === false)).toBe(true);
      expect(rows.every((w) => w.provinceName === null)).toBe(true);
      expect(rows.every((w) => typeof w.districtCode === 'string')).toBe(true);
    });

    it('AC-09: phân trang ổn định; limit=101 → 400; field lạ → 400', async () => {
      const p1 = await jwtGet(`${WARDS_URL}?provinceCode=2026_01&page=1&limit=50`).expect(200);
      const p2 = await jwtGet(`${WARDS_URL}?provinceCode=2026_01&page=2&limit=50`).expect(200);
      const p3 = await jwtGet(`${WARDS_URL}?provinceCode=2026_01&page=3&limit=50`).expect(200);
      expect(p2.body).toMatchObject({ total: 126, page: 2, limit: 50 });
      expect(p2.body.data).toHaveLength(50);
      expect(p3.body.data).toHaveLength(26);
      const all = [...codes(p1.body), ...codes(p2.body), ...codes(p3.body)];
      expect(new Set(all).size).toBe(126);

      await jwtGet(`${WARDS_URL}?limit=101`).expect(400);
      await jwtGet(`${WARDS_URL}?page=0`).expect(400);
      await jwtGet(`${WARDS_URL}?foo=1`).expect(400);
    });

    it('AC-10: tra theo mã — hiện hành mặc định, cũ qua provinceCode, 404 khi không có', async () => {
      const current = await jwtGet(`${WARDS_URL}/4`).expect(200);
      expect(current.body).toEqual({
        code: '4',
        name: 'Phường Ba Đình',
        provinceCode: '2026_01',
        provinceName: 'Hà Nội',
        districtCode: null,
        isCurrent: true,
      });
      await jwtGet(`${WARDS_URL}/001`).expect(404);

      const legacy = await jwtGet(`${WARDS_URL}/001?provinceCode=1995_01`).expect(200);
      expect(legacy.body).toMatchObject({
        name: 'Phường Phúc Xá',
        districtCode: '01',
        isCurrent: false,
        provinceName: null,
      });
      await jwtGet(`${WARDS_URL}/4?provinceCode=2026_79`).expect(404);
      await jwtGet(`${WARDS_URL}/4?foo=1`).expect(400);
    });

    it('AC-04 (wards): 401 không credential; API key vai không có quyền geo vẫn 200, body giống JWT', async () => {
      await request(app.getHttpServer()).get(`${WARDS_URL}?provinceCode=2026_01`).expect(401);
      await request(app.getHttpServer()).get(`${WARDS_URL}/4`).expect(401);

      const viaJwt = await jwtGet(`${WARDS_URL}?q=ba%20dinh&includeLegacy=true`).expect(200);
      const viaKey = await keyGet(`${WARDS_URL}?q=ba%20dinh&includeLegacy=true`).expect(200);
      expect(viaJwt.body.total).toBe(7);
      expect(viaKey.body).toEqual(viaJwt.body);

      const findJwt = await jwtGet(`${WARDS_URL}/001?provinceCode=1995_01`).expect(200);
      const findKey = await keyGet(`${WARDS_URL}/001?provinceCode=1995_01`).expect(200);
      expect(findKey.body).toEqual(findJwt.body);
    });
  });
});
