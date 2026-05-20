import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';

export interface SeedResult {
  organizationId: string;
  branchId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Bootstraps a full NestJS application for E2E testing.
 *
 * Expects a running PostgreSQL (synchronize: true for test) and Redis.
 * Environment variables should be set by global-setup.ts.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider('TYPEORM_MODULE_OPTIONS')
    .useValue({})
    .compile();

  const app = moduleFixture.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Resets the database by dropping and synchronizing all entities.
 * Only call between top-level describe blocks or in beforeAll.
 */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  await ds.synchronize(true);
}

/**
 * Seeds the minimum data required for most E2E flows:
 * - One organization
 * - One branch
 * - One user with admin-level roles
 * - Returns a valid access token for API calls
 */
export async function seedBaseData(
  app: INestApplication,
): Promise<SeedResult> {
  const ds = app.get(DataSource);

  const orgId = 'a0000000-0000-4000-8000-000000000001';
  const branchId = 'b0000000-0000-4000-8000-000000000001';
  const userId = 'c0000000-0000-4000-8000-000000000001';
  const roleId = 'd0000000-0000-4000-8000-000000000001';

  await ds.query(`
    INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
    VALUES ($1::uuid, $1::uuid, 'Test Org', 'admin@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [orgId, userId]);

  await ds.query(`
    INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, 'Main Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [branchId, orgId, userId]);

  const passwordHash = await bcrypt.hash('password123', 10);

  await ds.query(`
    INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, 'admin@test.com', $3, 'Admin', 'User', true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [userId, orgId, passwordHash]);

  await ds.query(`
    INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, 'admin', 'Full access role', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING
  `, [roleId, orgId]);

  await ds.query(`
    INSERT INTO user_roles (id, user_id, role_id, organization_id)
    VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
    ON CONFLICT DO NOTHING
  `, [userId, roleId, orgId]);

  await ds.query(`
    INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
    VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
    ON CONFLICT DO NOTHING
  `, [userId, branchId, orgId]);

  const allPermissions = [
    'customer.read', 'customer.write', 'customer.merge',
    'inventory.read', 'inventory.write', 'inventory.manage',
    'inventory.transfer.create', 'inventory.transfer.read',
    'inventory.transfer.approve', 'inventory.transfer.post', 'inventory.transfer.cancel',
    'inventory.adjustment.create', 'inventory.adjustment.read',
    'inventory.adjustment.submit', 'inventory.adjustment.approve',
    'inventory.adjustment.post', 'inventory.adjustment.cancel',
    'pos.session.manage', 'pos.session.approve_variance',
    'pos.sale.create', 'pos.return.create', 'pos.exchange.create',
    'accounting.journal.post', 'accounting.journal.reverse',
    'accounting.payables.create', 'accounting.payables.read', 'accounting.payables.update',
    'accounting.receivables.create', 'accounting.receivables.read',
    'accounting.receivables.update', 'accounting.receivables.write-off',
    'accounting.cash.create', 'accounting.cash.read',
    'accounting.coa.create', 'accounting.coa.read',
    'accounting.expenses.create', 'accounting.expenses.read',
    'reporting.dashboard.branch.read', 'reporting.dashboard.consolidated.read',
    'iam.user.read', 'iam.user.write', 'iam.user.delete',
    'iam.user.roles.write', 'iam.user.branches.write',
  ];

  // Seed an active document numbering rule for every DocumentType so that
  // services depending on `DocumentNumberingService.generate(...)` can produce
  // numbers during E2E flows. The production app seeds these via the
  // numbering admin UI; tests need them ready up-front.
  const documentTypes = [
    'INVOICE', 'SALE', 'RETURN', 'TRANSFER', 'ADJUSTMENT',
    'JOURNAL', 'PAYABLE', 'RECEIVABLE', 'PURCHASE_ORDER', 'GOODS_ISSUE',
  ];
  for (const documentType of documentTypes) {
    await ds.query(
      `INSERT INTO document_number_rules
         (id, organization_id, document_type, prefix, include_date, date_format,
          sequence_length, reset_policy, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, true, 'YYYYMMDD', 5, 'NEVER', true, $4::uuid, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [orgId, documentType, `${documentType.slice(0, 3)}-`, userId],
    );
  }

  for (const perm of allPermissions) {
    await ds.query(`
      INSERT INTO permissions (id, key, description, module)
      VALUES (gen_random_uuid(), $1, $1, $2)
      ON CONFLICT DO NOTHING
    `, [perm, perm.split('.')[0]]);

    await ds.query(`
      INSERT INTO role_permissions (id, role_id, permission_id)
      SELECT gen_random_uuid(), $1::uuid, p.id
      FROM permissions p WHERE p.key = $2
      ON CONFLICT DO NOTHING
    `, [roleId, perm]);
  }

  const server = app.getHttpServer();
  const loginRes = await request(server)
    .post('/auth/login')
    .send({
      email: 'admin@test.com',
      password: 'password123',
      organizationId: orgId,
    })
    .expect(200);

  return {
    organizationId: orgId,
    branchId,
    userId,
    accessToken: loginRes.body.accessToken,
    refreshToken: loginRes.body.refreshToken,
  };
}

/**
 * Builds Authorization header value from a token.
 */
export function authHeader(token: string): string {
  return `Bearer ${token}`;
}

export { request };
