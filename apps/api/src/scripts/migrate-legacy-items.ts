import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

const BATCH_SIZE = 100;

async function main() {
  const isRollback = process.argv.includes('--rollback');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    database: process.env.DB_NAME || 'erp_dev',
    username: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASS || 'erp_secret',
    entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Database connected.');

  try {
    if (isRollback) {
      await rollback(dataSource);
    } else {
      await migrate(dataSource);
    }
  } finally {
    await dataSource.destroy();
  }
}

async function migrate(ds: DataSource): Promise<void> {
  const [{ count: totalStr }] = await ds.query(
    `SELECT COUNT(*) as count FROM items WHERE product_id IS NULL`,
  );
  const total = parseInt(totalStr, 10);

  if (total === 0) {
    console.log('No legacy items to migrate. All items already have a product.');
    return;
  }

  console.log(`Found ${total} legacy items without a product. Starting migration...`);

  let migrated = 0;

  while (migrated < total) {
    const items: Array<{
      id: string;
      name: string;
      description: string | null;
      is_active: boolean;
      provider_id: string | null;
      organization_id: string;
      branch_id: string | null;
      created_by: string;
    }> = await ds.query(
      `SELECT id, name, description, is_active, provider_id, organization_id, branch_id, created_by
       FROM items
       WHERE product_id IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );

    if (items.length === 0) break;

    await ds.transaction(async (manager) => {
      for (const item of items) {
        const [product] = await manager.query(
          `INSERT INTO products (name, description, is_active, default_provider_id, auto_migrated, organization_id, branch_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            item.name,
            item.description,
            item.is_active,
            item.provider_id,
            true,
            item.organization_id,
            item.branch_id,
            item.created_by,
          ],
        );

        await manager.query(
          `UPDATE items SET product_id = $1 WHERE id = $2`,
          [product.id, item.id],
        );
      }
    });

    migrated += items.length;
    console.log(`Migrated ${migrated} of ${total} items...`);
  }

  console.log(`Migration complete: ${migrated} items wrapped into products.`);
}

async function rollback(ds: DataSource): Promise<void> {
  const [{ count: totalStr }] = await ds.query(
    `SELECT COUNT(*) as count FROM products WHERE auto_migrated = true`,
  );
  const total = parseInt(totalStr, 10);

  if (total === 0) {
    console.log('No auto-migrated products found. Nothing to rollback.');
    return;
  }

  console.log(`Found ${total} auto-migrated products. Rolling back...`);

  await ds.transaction(async (manager) => {
    const result = await manager.query(
      `UPDATE items SET product_id = NULL
       WHERE product_id IN (SELECT id FROM products WHERE auto_migrated = true)`,
    );
    console.log(`Unlinked ${result[1] ?? 0} items from auto-migrated products.`);

    const deleted = await manager.query(
      `DELETE FROM products WHERE auto_migrated = true`,
    );
    console.log(`Deleted ${deleted[1] ?? 0} auto-migrated products.`);
  });

  console.log('Rollback complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
