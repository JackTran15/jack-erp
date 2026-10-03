import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp, resetDatabase, seedBaseData, SeedResult } from './setup/test-app';
import { PromotionChainManagePermission1790101000000 } from '../../src/database/migrations/1790101000000-PromotionChainManagePermission';

/**
 * AC-15 (2026100301 T-01-02): the grant migration keeps today's CTKM managers
 * chain-wide, turns manager-level roles into branch-scoped CTKM managers, and
 * leaves everyone else alone — and `down` undoes exactly that.
 */
describe('PromotionChainManagePermission migration (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const r1PromotionWriter = 'd0000000-0000-4000-8000-0000000003a1';
  const r2Manager = 'd0000000-0000-4000-8000-0000000003b1';
  const r3Staff = 'd0000000-0000-4000-8000-0000000003c1';
  const CHAIN_KEY = 'promotion.chain.manage';
  const PROGRAM_KEYS = ['promotion.delete', 'promotion.read', 'promotion.write'];
  const ALL_KEYS = [CHAIN_KEY, ...PROGRAM_KEYS];

  const migration = new PromotionChainManagePermission1790101000000();
  const run = async (step: 'up' | 'down') => {
    const runner = ds.createQueryRunner();
    try {
      await migration[step](runner);
    } finally {
      await runner.release();
    }
  };

  const keysOf = async (roleId: string): Promise<string[]> =>
    (
      await ds.query(
        `SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = $1::uuid AND p.key = ANY($2::text[]) ORDER BY p.key`,
        [roleId, ALL_KEYS],
      )
    ).map((r: { key: string }) => r.key);

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
           VALUES (gen_random_uuid(), $1, $1, 'test') ON CONFLICT DO NOTHING`,
          [key],
        );
        await ds.query(
          `INSERT INTO role_permissions (id, role_id, permission_id)
           SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2`,
          [roleId, key],
        );
      }
    };
    await grant(r1PromotionWriter, 'CTKM thử', ['promotion.read', 'promotion.write']);
    await grant(r2Manager, 'Quản lý thử', ['customer.read', 'customer.merge']);
    await grant(r3Staff, 'Nhân viên thử', ['customer.read', 'customer.write']);

    // The suite DB already ran every migration, so the chain key may exist
    // with grants on the seeded admin role; `up` is idempotent by design.
    await run('up');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers promotion.chain.manage with its Vietnamese description', async () => {
    const [row] = await ds.query(`SELECT description, module FROM permissions WHERE key = $1`, [CHAIN_KEY]);
    expect(row).toEqual({ description: 'Quản lý CTKM toàn chuỗi', module: 'promotion' });
  });

  it('AC-15: a role that held promotion.write also gets promotion.chain.manage', async () => {
    expect(await keysOf(r1PromotionWriter)).toEqual([CHAIN_KEY, 'promotion.read', 'promotion.write'].sort());
  });

  it('AC-15: a customer.merge role gets read/write/delete but not the chain key', async () => {
    expect(await keysOf(r2Manager)).toEqual(PROGRAM_KEYS);
  });

  it('AC-15: a role holding neither is unchanged', async () => {
    expect(await keysOf(r3Staff)).toEqual([]);
  });

  it('AC-15: down removes the manager grants and the chain key, keeps what R1 had', async () => {
    await run('down');
    expect(await keysOf(r2Manager)).toEqual([]);
    expect(await keysOf(r3Staff)).toEqual([]);
    expect(await keysOf(r1PromotionWriter)).toEqual(['promotion.read', 'promotion.write']);
  });
});
