import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, resetDatabase, seedBaseData, SeedResult } from './setup/test-app';
import { CustomerPointsPermissions1790100800000 } from '../../src/database/migrations/1790100800000-CustomerPointsPermissions';

/**
 * AC-13 (2026100101 T-01-01): the grant migration hands both point keys to every role
 * holding `customer.merge`, and to no role that only holds `customer.read`/`customer.write`.
 */
describe('CustomerPointsPermissions migration (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const managerRole = 'd0000000-0000-4000-8000-0000000002a1';
  const staffRole = 'd0000000-0000-4000-8000-0000000002b1';
  const POINT_KEYS = ['customer.points.adjust', 'customer.points.history.read'];

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const grant = async (roleId: string, name: string, keys: string[]) => {
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, null, NOW(), NOW())`,
        [roleId, seed.organizationId, name],
      );
      for (const key of keys) {
        await ds.query(
          `INSERT INTO permissions (id, key, description, module)
           VALUES (gen_random_uuid(), $1, $1, 'customer') ON CONFLICT DO NOTHING`,
          [key],
        );
        await ds.query(
          `INSERT INTO role_permissions (id, role_id, permission_id)
           SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2`,
          [roleId, key],
        );
      }
    };
    await grant(managerRole, 'Quản lý thử', ['customer.read', 'customer.write', 'customer.merge']);
    await grant(staffRole, 'Nhân viên thử', ['customer.read', 'customer.write']);

    const runner = ds.createQueryRunner();
    try {
      await new CustomerPointsPermissions1790100800000().up(runner);
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const keysOf = async (roleId: string): Promise<string[]> =>
    (
      await ds.query(
        `SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = $1::uuid AND p.key = ANY($2::text[]) ORDER BY p.key`,
        [roleId, POINT_KEYS],
      )
    ).map((r: { key: string }) => r.key);

  it('registers both keys with their Vietnamese description', async () => {
    const rows = await ds.query(
      `SELECT key, description, module FROM permissions WHERE key = ANY($1::text[]) ORDER BY key`,
      [POINT_KEYS],
    );
    expect(rows).toEqual([
      { key: 'customer.points.adjust', description: 'Điều chỉnh điểm thành viên', module: 'customer' },
      { key: 'customer.points.history.read', description: 'Xem lịch sử điểm thành viên', module: 'customer' },
    ]);
  });

  it('grants both keys to a role holding customer.merge (AC-13)', async () => {
    expect(await keysOf(managerRole)).toEqual(POINT_KEYS);
  });

  it('grants nothing to a role holding only customer.read/write (AC-13)', async () => {
    expect(await keysOf(staffRole)).toEqual([]);
  });
});
