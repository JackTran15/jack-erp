import 'reflect-metadata';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BranchEntity } from '../../src/modules/branch/branch.entity';
import { StorageEntity } from '../../src/modules/inventory/location/storage.entity';
import { AddStorageDefaultIssuing1789920000000 } from '../../src/database/migrations/1789920000000-AddStorageDefaultIssuing';

/**
 * E2E for the `is_default_issuing` migration (T-01-01) — runs real SQL
 * against `erp_test`.
 *
 * Only a DataSource is needed here, not a full Nest app: the behaviour under
 * test is entity-level (column default, partial unique index) and the
 * migration's own up()/down(), none of which touch Kafka/Redis.
 *
 * `beforeAll` seeds the branches/storages that stand in for "data that
 * existed before this feature shipped", then runs the migration's real
 * `down()` followed by `up()` on a QueryRunner. down() first so up() always
 * runs against a schema where the column doesn't exist yet — `synchronize`
 * already created `is_default_issuing` from the entity (added alongside
 * this migration), so calling up() directly would fail on "column already
 * exists". This also happens to double as a reversibility check: down()
 * dropping the column/index and up() recreating them is the same code path
 * `pnpm migration:revert` / `pnpm migration:run` exercise.
 *
 * The suite ends with the migration applied (not reverted) and its own rows
 * deleted, so later e2e spec files see a normal migrated schema.
 */

const TEST_DB_NAME = process.env.E2E_DB_NAME || 'erp_test';
if (!/test/i.test(TEST_DB_NAME)) {
  throw new Error(
    `Refusing to run against "${TEST_DB_NAME}": this suite drops every table.`,
  );
}

describe('Storage default issuing flag (e2e)', () => {
  let ds: DataSource;
  let seed: { organizationId: string; userId: string };

  const T0 = new Date('2020-01-01T00:00:00.000Z');
  const T1 = new Date('2020-01-02T00:00:00.000Z');
  const T2 = new Date('2020-01-03T00:00:00.000Z');
  const T3 = new Date('2020-01-04T00:00:00.000Z');

  let branchBackfillId: string;
  let mainStorageId: string;
  let inactiveOldRealId: string;
  let activeOlderRealId: string;
  let activeNewerRealId: string;
  let branchShowroomOnlyId: string;

  const createBranch = async (name: string): Promise<string> => {
    const repo = ds.getRepository(BranchEntity);
    const branch = await repo.save(
      repo.create({
        organizationId: seed.organizationId,
        name,
        status: BranchStatus.ACTIVE,
        isMainBranch: false,
        createdBy: seed.userId,
      }),
    );
    return branch.id;
  };

  const createStorage = async (opts: {
    branchId: string;
    name: string;
    isMainStorage?: boolean;
    isActive?: boolean;
    createdAt?: Date;
  }): Promise<StorageEntity> => {
    const repo = ds.getRepository(StorageEntity);
    return repo.save(
      repo.create({
        organizationId: seed.organizationId,
        branchId: opts.branchId,
        name: opts.name,
        isMainStorage: opts.isMainStorage ?? false,
        isActive: opts.isActive ?? true,
        createdAt: opts.createdAt,
        createdBy: seed.userId,
      }),
    );
  };

  beforeAll(async () => {
    const connection = {
      type: 'postgres' as const,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433', 10),
      database: TEST_DB_NAME,
      username: process.env.DB_USER || 'erp_user',
      password: process.env.DB_PASS || 'erp_secret',
    };

    const cleaner = await new DataSource(connection).initialize();
    const [{ current_database: live }]: Array<{ current_database: string }> =
      await cleaner.query('SELECT current_database()');
    if (!/test/i.test(live)) {
      await cleaner.destroy();
      throw new Error(`Refusing to drop schema on "${live}".`);
    }
    await cleaner.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await cleaner.destroy();

    ds = await new DataSource({
      ...connection,
      entities: [path.join(__dirname, '..', '..', 'src', '**', '*.entity.{ts,js}')],
      synchronize: true,
      logging: false,
    }).initialize();

    seed = {
      organizationId: randomUUID(),
      userId: randomUUID(),
    };

    // Branch with a real backfill candidate: a showroom storage, an older
    // real storage that's already inactive, and two active real storages at
    // different ages — the flag must land on the older active one.
    branchBackfillId = await createBranch('Chi nhánh backfill');
    mainStorageId = (
      await createStorage({
        branchId: branchBackfillId,
        name: 'Showroom (backing)',
        isMainStorage: true,
        isActive: true,
        createdAt: T0,
      })
    ).id;
    inactiveOldRealId = (
      await createStorage({
        branchId: branchBackfillId,
        name: 'Kho cũ đã ngừng hoạt động',
        isMainStorage: false,
        isActive: false,
        createdAt: T1,
      })
    ).id;
    activeOlderRealId = (
      await createStorage({
        branchId: branchBackfillId,
        name: 'Kho đang hoạt động, cũ hơn',
        isMainStorage: false,
        isActive: true,
        createdAt: T2,
      })
    ).id;
    activeNewerRealId = (
      await createStorage({
        branchId: branchBackfillId,
        name: 'Kho đang hoạt động, mới hơn',
        isMainStorage: false,
        isActive: true,
        createdAt: T3,
      })
    ).id;

    // Branch with only the auto-generated showroom storage — must get no flag.
    branchShowroomOnlyId = await createBranch('Chi nhánh chỉ có showroom');
    await createStorage({
      branchId: branchShowroomOnlyId,
      name: 'Showroom duy nhất',
      isMainStorage: true,
      isActive: true,
      createdAt: T0,
    });

    const migration = new AddStorageDefaultIssuing1789920000000();
    const runner = ds.createQueryRunner();
    await runner.connect();
    await migration.down(runner);
    await migration.up(runner);
    await runner.release();
  }, 180_000);

  afterAll(async () => {
    await ds.getRepository(StorageEntity).delete({ organizationId: seed.organizationId });
    await ds.getRepository(BranchEntity).delete({ organizationId: seed.organizationId });
    await ds?.destroy();
  });

  it('cột is_default_issuing tồn tại và mặc định false với kho mới', async () => {
    const [{ exists }]: Array<{ exists: boolean }> = await ds.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'storages' AND column_name = 'is_default_issuing'
       ) AS exists`,
    );
    expect(exists).toBe(true);

    const branchId = await createBranch('Chi nhánh cột mặc định');
    const storage = await createStorage({ branchId, name: 'Kho mới' });

    const row = await ds
      .getRepository(StorageEntity)
      .findOneByOrFail({ id: storage.id });
    expect(row.isDefaultIssuing).toBe(false);
  });

  it('partial unique index chặn hai kho cùng chi nhánh cùng true, cho phép khác chi nhánh', async () => {
    const branch1 = await createBranch('Chi nhánh index A');
    const branch2 = await createBranch('Chi nhánh index B');
    const storage1a = await createStorage({ branchId: branch1, name: 'Kho A1' });
    const storage1b = await createStorage({ branchId: branch1, name: 'Kho A2' });
    const storage2a = await createStorage({ branchId: branch2, name: 'Kho B1' });

    await ds.query(
      `UPDATE storages SET is_default_issuing = true WHERE id = $1`,
      [storage1a.id],
    );

    await expect(
      ds.query(`UPDATE storages SET is_default_issuing = true WHERE id = $1`, [
        storage1b.id,
      ]),
    ).rejects.toMatchObject({ code: '23505' });

    await expect(
      ds.query(`UPDATE storages SET is_default_issuing = true WHERE id = $1`, [
        storage2a.id,
      ]),
    ).resolves.toBeDefined();

    const flaggedInBranch1 = await ds
      .getRepository(StorageEntity)
      .find({ where: { branchId: branch1, isDefaultIssuing: true } });
    expect(flaggedInBranch1).toHaveLength(1);
    expect(flaggedInBranch1[0].id).toBe(storage1a.id);
  });

  it('một kho có thể mang cả hai cờ mặc định cùng lúc (AC-03)', async () => {
    const branchId = await createBranch('Chi nhánh hai cờ');
    const storage = await createStorage({ branchId, name: 'Kho hai cờ' });

    await ds.query(
      `UPDATE storages SET is_default_issuing = true, is_default_receiving = true WHERE id = $1`,
      [storage.id],
    );

    const row = await ds
      .getRepository(StorageEntity)
      .findOneByOrFail({ id: storage.id });
    expect(row.isDefaultIssuing).toBe(true);
    expect(row.isDefaultReceiving).toBe(true);
  });

  describe('backfill (AC-06)', () => {
    it('chọn đúng một kho: kho lưu trữ thật đang hoạt động cũ nhất', async () => {
      const rows = await ds
        .getRepository(StorageEntity)
        .find({ where: { branchId: branchBackfillId } });
      const flagged = rows.filter((r) => r.isDefaultIssuing);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].id).toBe(activeOlderRealId);
    });

    it('không chọn kho lưu trữ đã ngừng hoạt động dù cũ hơn', async () => {
      const inactive = await ds
        .getRepository(StorageEntity)
        .findOneByOrFail({ id: inactiveOldRealId });
      expect(inactive.isDefaultIssuing).toBe(false);
    });

    it('không chọn kho backing showroom', async () => {
      const main = await ds
        .getRepository(StorageEntity)
        .findOneByOrFail({ id: mainStorageId });
      expect(main.isDefaultIssuing).toBe(false);

      const newer = await ds
        .getRepository(StorageEntity)
        .findOneByOrFail({ id: activeNewerRealId });
      expect(newer.isDefaultIssuing).toBe(false);
    });

    it('chi nhánh chỉ có kho backing showroom → không kho nào được gán cờ', async () => {
      const rows = await ds
        .getRepository(StorageEntity)
        .find({ where: { branchId: branchShowroomOnlyId } });
      expect(rows.every((r) => !r.isDefaultIssuing)).toBe(true);
    });
  });
});
