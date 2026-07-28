import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * Cross-org / cross-branch isolation for the 3 stock-voucher print-payload
 * routes (T-03-02, AC-13). One table drives all three routes so adding a
 * fourth voucher kind later (UOW-04, treasury) is one row, not a new suite.
 *
 * A tenant boundary here is a security boundary, not a UX detail: the route
 * returns the full document (counterparty name, line items) as JSON, so a
 * leak is not "wrong data on screen" — it's another org's business record.
 */
describe('Voucher print-payload isolation (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let itemId: string;
  let storageId: string;
  let locationId: string;

  let otherOrgToken: string;
  let otherBranchId: string;

  let receiptId: string;
  let issueId: string;
  let transferId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function seedCatalog(): Promise<void> {
    itemId = 'e0000000-0000-4000-8000-000000000001';
    storageId = 'e0000000-0000-4000-8000-000000000002';
    locationId = 'e0000000-0000-4000-8000-000000000003';

    await ds.query(
      `INSERT INTO items
         (id, organization_id, code, name, unit, purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'VP-SKU-01', 'Voucher Print Item', 'pcs', 100, 200, true, true, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [itemId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Kho chính', true, $4::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [storageId, seed.organizationId, seed.branchId, seed.userId],
    );
    await ds.query(
      `INSERT INTO locations
         (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'A-01', 'Kệ A-01', 'SHELF', true, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [locationId, seed.organizationId, seed.branchId, storageId, seed.userId],
    );
  }

  /** A second branch in the SAME org, with the seeded user also assigned to it. */
  async function seedOtherBranch(): Promise<void> {
    otherBranchId = 'e0000000-0000-4000-8000-0000000000b2';
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Chi nhánh khác', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherBranchId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [seed.userId, otherBranchId, seed.organizationId],
    );
  }

  /** A second organization with its own user + role, granted just the 3 read permissions. */
  async function seedOtherOrg(): Promise<void> {
    const otherOrgId = 'e0000000-0000-4000-8000-0000000000ff';
    const otherUserId = 'e0000000-0000-4000-8000-0000000000fe';
    const otherRoleBranchId = 'e0000000-0000-4000-8000-0000000000fd';
    const otherRoleId = 'e0000000-0000-4000-8000-0000000000fc';

    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Other Org', 'other-voucher@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherOrgId, otherUserId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherRoleBranchId, otherOrgId, otherUserId],
    );
    const passwordHash = await bcrypt.hash('password123', 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'other-voucher@test.com', $3, 'Other', 'User', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [otherUserId, otherOrgId, passwordHash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'reader', 'Voucher print-payload read role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherRoleId, otherOrgId],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [otherUserId, otherRoleId, otherOrgId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [otherUserId, otherRoleBranchId, otherOrgId],
    );
    for (const perm of ['goods_receipt.read', 'inventory.read', 'inventory.transfer.read']) {
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id
         FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [otherRoleId, perm],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'other-voucher@test.com',
        password: 'password123',
        organizationId: otherOrgId,
      })
      .expect(200);
    otherOrgToken = loginRes.body.accessToken;
  }

  async function seedGoodsReceipt(): Promise<string> {
    const id = 'e0000000-0000-4000-8000-000000000010';
    const lineId = 'e0000000-0000-4000-8000-000000000011';
    await ds.query(
      `INSERT INTO goods_receipts
         (id, organization_id, branch_id, document_number, status, purpose, received_at, location_id, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'IMP-TEST-01', 'POSTED', 'OTHER', NOW(), $4::uuid, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, seed.organizationId, seed.branchId, locationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO goods_receipt_lines
         (id, organization_id, branch_id, goods_receipt_id, item_id, location_id, uom_code, quantity, unit_price, line_total, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'cái', 5, 100, 500, $7::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [lineId, seed.organizationId, seed.branchId, id, itemId, locationId, seed.userId],
    );
    return id;
  }

  async function seedGoodsIssue(): Promise<string> {
    const id = 'e0000000-0000-4000-8000-000000000020';
    const lineId = 'e0000000-0000-4000-8000-000000000021';
    await ds.query(
      `INSERT INTO goods_issues
         (id, organization_id, branch_id, document_number, location_id, reason, status, purpose, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'XK-TEST-01', $4::uuid, 'Test', 'POSTED', 'OTHER', $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, seed.organizationId, seed.branchId, locationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO goods_issue_lines
         (id, goods_issue_id, item_id, location_id, quantity, unit_price, line_total, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 2, 100, 200, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [lineId, id, itemId, locationId, seed.userId],
    );
    return id;
  }

  async function seedTransferOrder(): Promise<string> {
    const id = 'e0000000-0000-4000-8000-000000000030';
    const lineId = 'e0000000-0000-4000-8000-000000000031';
    await ds.query(
      `INSERT INTO transfer_orders
         (id, organization_id, branch_id, document_number, status, source_branch_id, destination_branch_id, source_storage_id, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'LDC-TEST-01', 'DRAFT', $3::uuid, $3::uuid, $4::uuid, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, seed.organizationId, seed.branchId, storageId, seed.userId],
    );
    await ds.query(
      `INSERT INTO transfer_order_lines
         (id, organization_id, branch_id, transfer_order_id, item_id, requested_qty, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 3, $6::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [lineId, seed.organizationId, seed.branchId, id, itemId, seed.userId],
    );
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await seedCatalog();
    await seedOtherBranch();
    await seedOtherOrg();

    receiptId = await seedGoodsReceipt();
    issueId = await seedGoodsIssue();
    transferId = await seedTransferOrder();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns each document to its own org', async () => {
    await request(app.getHttpServer())
      .get(`/goods-receipts/${receiptId}/print-payload`)
      .set(headers())
      .expect(200);
    await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${issueId}/print-payload`)
      .set(headers())
      .expect(200);
    await request(app.getHttpServer())
      .get(`/inventory/transfer-orders/${transferId}/print-payload`)
      .set(headers())
      .expect(200);
  });

  describe.each([
    { label: 'goods receipt', path: () => `/goods-receipts/${receiptId}/print-payload` },
    {
      label: 'goods issue',
      path: () => `/inventory/goods-issues/${issueId}/print-payload`,
    },
    {
      label: 'transfer order',
      path: () => `/inventory/transfer-orders/${transferId}/print-payload`,
    },
  ])('$label', ({ path }) => {
    it('404s for a token from a different organization, without leaking fields', async () => {
      const res = await request(app.getHttpServer())
        .get(path())
        .set({ Authorization: authHeader(otherOrgToken) })
        .expect(404);

      const body = JSON.stringify(res.body);
      expect(body).not.toContain('TEST-01');
      expect(body).not.toContain('Voucher Print Item');
    });
  });

  describe.each([
    { label: 'goods receipt', path: () => `/goods-receipts/${receiptId}/print-payload` },
    {
      label: 'goods issue',
      path: () => `/inventory/goods-issues/${issueId}/print-payload`,
    },
  ])('$label (branch-scoped)', ({ path }) => {
    it('404s when requested from a different branch in the same org', async () => {
      await request(app.getHttpServer())
        .get(path())
        .set({
          Authorization: authHeader(seed.accessToken),
          'X-Branch-Id': otherBranchId,
        })
        .expect(404);
    });
  });

  it('transfer order print-payload does not require @RequireBranchScope, only org scope', async () => {
    // Documented in T-03-02: transfer-order's getById has no branch-scope guard,
    // so it is exercised by the cross-org case above only.
    await request(app.getHttpServer())
      .get(`/inventory/transfer-orders/${transferId}/print-payload`)
      .set({ Authorization: authHeader(seed.accessToken), 'X-Branch-Id': otherBranchId })
      .expect(200);
  });
});
