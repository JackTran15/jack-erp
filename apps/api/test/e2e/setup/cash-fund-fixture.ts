import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { authHeader, request, SeedResult } from './test-app';
import { CoaSeederService } from '../../../src/modules/accounting/seeders/coa-seeder.service';
import { RbacService } from '../../../src/modules/rbac/rbac.service';

/**
 * The cash-fund report fixture of `02-requirements.md` (PT-01..PC-07): one
 * organization, two branches, a cash fund per branch, one deposit account on
 * branch A with `opening_balance = 1.000.000`, five voucher categories, and the
 * vouchers below — posted through the real endpoints so every status, line,
 * reversal and document number is what production would write.
 *
 * Shared by the e2e suites of UOW-01/02/03; those import, never re-seed.
 *
 * | Mã     | CN | Loại          | Ngày       | Mục đích / mục                          | Số tiền   |
 * | PT-01  | A  | Phiếu thu TM  | 2026-08-30 | POS_SALE                                | 500.000   |
 * | PT-02  | A  | Phiếu thu TM  | 2026-09-02 | POS_SALE                                | 700.000   |
 * | PT-03  | A  | Phiếu thu TM  | 2026-09-05 | DEBT_COLLECTION                         | 300.000   |
 * | PT-04  | A  | Phiếu thu TM  | 2026-09-06 | OTHER, mục "Thu lãi"                    | 50.000    |
 * | PT-05  | A  | Phiếu thu TM  | 2026-09-07 | OTHER, không mục                        | 20.000    |
 * | PTG-01 | A  | Thu tiền gửi  | 2026-09-03 | DEBT_COLLECTION                         | 1.600.000 |
 * | PC-01  | A  | Phiếu chi TM  | 2026-09-04 | SUPPLIER_PAYMENT                        | 200.000   |
 * | PC-02  | A  | Phiếu chi TM  | 2026-09-08 | EXPENSE: Tiền điện 90.000 + Tiền nước 10.000 | 100.000 |
 * | PC-03  | A  | Phiếu chi TM  | 2026-09-09 | EXPENSE, mục "Tiền điện"                | 60.000    |
 * | PC-04  | A  | Phiếu chi TM  | 2026-09-10 | REFUND, không mục                       | 40.000    |
 * | PC-05  | A  | Phiếu chi TM  | 2026-09-11 | EXPENSE, mục "Tiền lương" — bị đảo (PC-05R) | 500.000 |
 * | PC-06  | B  | Phiếu chi TM  | 2026-09-05 | EXPENSE, mục "Tiền điện"                | 30.000    |
 * | PC-07  | A  | Phiếu chi TM  | 2026-09-13 | EXPENSE, mục "Tiền điện" — DRAFT        | 70.000    |
 *
 * Deviations from the table, and why:
 * - PC-05R is dated by the service (`today()`), not 2026-09-12: the reverse
 *   endpoint takes only a reason. Both PC-05 (REVERSED) and PC-05R (REVERSAL)
 *   are excluded regardless of date.
 * - PC-07 carries 70.000 rather than "0": a zero-amount draft would prove
 *   nothing about the DRAFT filter. It is inserted by SQL because the create
 *   endpoints auto-post.
 * - PC-06 is written by a second user assigned to branch B only: `ActorContext`
 *   takes the branch from the JWT (`branchIds[0]`), so the admin token cannot
 *   act under B by switching `X-Branch-Id`.
 */
export interface CashFundFixture {
  branchAId: string;
  branchBId: string;
  adminRoleId: string;
  cashAccountAId: string;
  cashAccountBId: string;
  depositAccountAId: string;
  /** `cash_voucher_categories.id` by fixture name. */
  categories: {
    thuLai: string;
    tienDien: string;
    tienNuoc: string;
    tienThue: string;
    tienLuong: string;
  };
  /** Voucher ids by the code of the requirements table. */
  vouchers: {
    PT01: string;
    PT02: string;
    PT03: string;
    PT04: string;
    PT05: string;
    PTG01: string;
    PC01: string;
    PC02: string;
    PC03: string;
    PC04: string;
    PC05: string;
    PC05R: string;
    PC06: string;
    PC07: string;
  };
  /** Admin-role user assigned to branch B only (wrote PC-06). */
  branchBUser: { userId: string; accessToken: string };
}

/** Every permission the fixture and the cash-fund e2e suites need on the admin role. */
export const CASH_FUND_ADMIN_PERMISSIONS = [
  'reporting.cash.read',
  'reporting.cash.consolidated.read',
  'reporting.cash.cash-in-out-situation.read',
  'reporting.cash.cash-in-out-list.read',
  'reporting.cash.expenses-by-category.read',
  'reporting.cash.expense-list-by-category.read',
  'reporting.cash.expenses-by-time.read',
  'accounting.cash_receipt.create',
  'accounting.cash_receipt.post',
  'accounting.cash_receipt.reverse',
  'accounting.cash_receipt.read',
  'accounting.cash_payment.create',
  'accounting.cash_payment.post',
  'accounting.cash_payment.reverse',
  'accounting.cash_payment.read',
  'accounting.bank_receipt.create',
  'accounting.bank_receipt.post',
  'accounting.bank_receipt.read',
  'accounting.cash.create',
  'accounting.cash.read',
];

/** Insert the permission rows (if missing) and attach them to `roleId`. */
export async function grantPermissions(
  ds: DataSource,
  roleId: string,
  keys: string[],
): Promise<void> {
  for (const key of keys) {
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, $2) ON CONFLICT DO NOTHING`,
      [key, key.split('.')[0]],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
       ON CONFLICT DO NOTHING`,
      [roleId, key],
    );
  }
}

/** A role of the seeded organization holding exactly `permissionKeys`. */
export async function createRole(
  ds: DataSource,
  organizationId: string,
  name: string,
  permissionKeys: string[],
): Promise<string> {
  const roleId = randomUUID();
  await ds.query(
    `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $3, NOW(), NOW())`,
    [roleId, organizationId, name],
  );
  await grantPermissions(ds, roleId, permissionKeys);
  return roleId;
}

/**
 * A fresh user with one role, assigned to the given branches (possibly none),
 * logged in after the assignments exist so the JWT carries them.
 */
export async function createLoggedInUser(
  app: INestApplication,
  seed: SeedResult,
  opts: { email: string; roleId: string; branchIds: string[] },
): Promise<{ userId: string; accessToken: string }> {
  const ds = app.get(DataSource);
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash('password123', 10);
  await ds.query(
    `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'E2E', 'User', true, NOW(), NOW())`,
    [userId, seed.organizationId, opts.email, passwordHash],
  );
  await ds.query(
    `INSERT INTO user_roles (id, user_id, role_id, organization_id)
     VALUES (gen_random_uuid(), $1, $2, $3)`,
    [userId, opts.roleId, seed.organizationId],
  );
  for (const branchId of opts.branchIds) {
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
      [userId, branchId, seed.organizationId],
    );
  }
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({
      email: opts.email,
      password: 'password123',
      organizationId: seed.organizationId,
    })
    .expect(200);
  return { userId, accessToken: res.body.accessToken };
}

interface LineInput {
  description: string;
  amount: number;
  categoryId?: string;
}

export async function seedCashFundFixture(
  app: INestApplication,
  seed: SeedResult,
): Promise<CashFundFixture> {
  const ds = app.get(DataSource);
  const server = app.getHttpServer();
  const branchAId = seed.branchId;

  await app
    .get(CoaSeederService)
    .seedForOrganization(seed.organizationId, seed.userId);

  const roleRows = await ds.query(
    `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
    [seed.organizationId],
  );
  const adminRoleId: string = roleRows[0].id;
  await grantPermissions(ds, adminRoleId, CASH_FUND_ADMIN_PERMISSIONS);
  await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

  const accountByCode = async (code: string): Promise<string> => {
    const rows = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [seed.organizationId, code],
    );
    return rows[0].id;
  };
  const cashGlId = await accountByCode('1111');
  const revenueGlId = await accountByCode('511');
  const expenseGlId = await accountByCode('642');
  const payableGlId = await accountByCode('331');

  // ---- branch B + its user ----------------------------------------------
  const branchBId = randomUUID();
  await ds.query(
    `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
     VALUES ($1, $2, 'Branch B', 'ACTIVE', false, $3, NOW(), NOW())`,
    [branchBId, seed.organizationId, seed.userId],
  );
  const branchBUser = await createLoggedInUser(app, seed, {
    email: 'branch-b@test.com',
    roleId: adminRoleId,
    branchIds: [branchBId],
  });

  const headersA = {
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': branchAId,
  };
  const headersB = {
    Authorization: authHeader(branchBUser.accessToken),
    'X-Branch-Id': branchBId,
  };

  // ---- cash funds (one per branch) ---------------------------------------
  // The fund balance is not a voucher, so it never reaches the report; B's
  // opening balance only lets PC-06 clear the insufficient-balance check.
  const cashA = await request(server)
    .post('/cash/accounts')
    .set(headersA)
    .send({ name: 'Quỹ A', type: 'REGISTER', accountId: cashGlId, balance: 0 })
    .expect(201);
  const cashAccountAId: string = cashA.body.id;
  const cashB = await request(server)
    .post('/cash/accounts')
    .set(headersB)
    .send({ name: 'Quỹ B', type: 'REGISTER', accountId: cashGlId, balance: 100000 })
    .expect(201);
  const cashAccountBId: string = cashB.body.id;

  // ---- deposit account A: opening 1.000.000 on 2026-01-01 ----------------
  await ds.query(
    `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
    [seed.organizationId, seed.userId],
  );
  const coaBankId = await accountByCode('1121');
  const bankId = randomUUID();
  await ds.query(
    `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
     VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
    [bankId, seed.organizationId, seed.userId],
  );
  const depositAccountAId = randomUUID();
  await ds.query(
    `INSERT INTO deposit_accounts
       (id, organization_id, branch_id, name, code, account_no, account_name,
        bank_id, type, account_id, opening_balance, opening_date, balance,
        allow_negative, is_default, status, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, 'Tiền gửi A', 'DEP-A', 'ACC-DEP-A', 'ERP Test', $4,
             'BANK_ACCOUNT', $5, 1000000, '2026-01-01', 1000000, false, true,
             'ACTIVE', $6, NOW(), NOW())`,
    [depositAccountAId, seed.organizationId, branchAId, bankId, coaBankId, seed.userId],
  );

  // ---- categories (org-wide) ---------------------------------------------
  const insertCategory = async (
    code: string,
    name: string,
    direction: 'IN' | 'OUT',
    displayOrder: number,
  ): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO cash_voucher_categories
         (id, organization_id, branch_id, code, name, direction, is_active, display_order,
          created_by, created_at, updated_at)
       VALUES ($1, $2, NULL, $3, $4, $5, true, $6, $7, NOW(), NOW())`,
      [id, seed.organizationId, code, name, direction, displayOrder, seed.userId],
    );
    return id;
  };
  const categories = {
    thuLai: await insertCategory('THU_LAI', 'Thu lãi', 'IN', 1),
    tienDien: await insertCategory('TIEN_DIEN', 'Tiền điện', 'OUT', 1),
    tienNuoc: await insertCategory('TIEN_NUOC', 'Tiền nước', 'OUT', 2),
    tienThue: await insertCategory('TIEN_THUE', 'Tiền thuê', 'OUT', 3),
    tienLuong: await insertCategory('TIEN_LUONG', 'Tiền lương', 'OUT', 4),
  };

  // ---- vouchers ----------------------------------------------------------
  const total = (lines: LineInput[]) => lines.reduce((s, l) => s + l.amount, 0);

  const cashReceipt = async (
    voucherDate: string,
    purpose: string,
    lines: LineInput[],
  ): Promise<string> => {
    const res = await request(server)
      .post('/cash-receipts')
      .set(headersA)
      .send({
        voucherDate,
        purpose,
        cashAccountId: cashAccountAId,
        contraAccountId: revenueGlId,
        totalAmount: total(lines),
        lines,
      })
      .expect(201);
    return res.body.id;
  };

  const cashPayment = async (
    headers: Record<string, string>,
    cashAccountId: string,
    voucherDate: string,
    purpose: string,
    lines: LineInput[],
    reason?: string,
  ): Promise<string> => {
    const res = await request(server)
      .post('/cash-payments')
      .set(headers)
      .send({
        voucherDate,
        purpose,
        cashAccountId,
        contraAccountId: purpose === 'SUPPLIER_PAYMENT' ? payableGlId : expenseGlId,
        totalAmount: total(lines),
        ...(reason ? { reason } : {}),
        lines,
      })
      .expect(201);
    return res.body.id;
  };

  // Receipts first so the register can cover the payments that follow.
  const PT01 = await cashReceipt('2026-08-30', 'POS_SALE', [
    { description: 'Bán hàng POS', amount: 500000 },
  ]);
  const PT02 = await cashReceipt('2026-09-02', 'POS_SALE', [
    { description: 'Bán hàng POS', amount: 700000 },
  ]);
  const PT03 = await cashReceipt('2026-09-05', 'DEBT_COLLECTION', [
    { description: 'Thu nợ khách hàng', amount: 300000 },
  ]);
  const PT04 = await cashReceipt('2026-09-06', 'OTHER', [
    { description: 'Thu lãi tiền gửi', amount: 50000, categoryId: categories.thuLai },
  ]);
  const PT05 = await cashReceipt('2026-09-07', 'OTHER', [
    { description: 'Thu khác', amount: 20000 },
  ]);

  const ptg = await request(server)
    .post('/bank-receipts')
    .set(headersA)
    .send({
      docDate: '2026-09-03',
      depositAccountId: depositAccountAId,
      purpose: 'DEBT_COLLECTION',
      contraAccountId: revenueGlId,
      totalAmount: 1600000,
      lines: [{ description: 'Khách chuyển khoản trả nợ', amount: 1600000 }],
    })
    .expect(201);
  const PTG01: string = ptg.body.id;

  const PC01 = await cashPayment(headersA, cashAccountAId, '2026-09-04', 'SUPPLIER_PAYMENT', [
    { description: 'Trả tiền hàng NCC', amount: 200000 },
  ]);
  const PC02 = await cashPayment(
    headersA,
    cashAccountAId,
    '2026-09-08',
    'EXPENSE',
    [
      { description: 'Tiền điện', amount: 90000, categoryId: categories.tienDien },
      { description: 'Tiền nước', amount: 10000, categoryId: categories.tienNuoc },
    ],
    'Tiền điện nước tháng 9',
  );
  const PC03 = await cashPayment(
    headersA,
    cashAccountAId,
    '2026-09-09',
    'EXPENSE',
    [{ description: 'Tiền điện kho', amount: 60000, categoryId: categories.tienDien }],
    'Tiền điện kho',
  );
  const PC04 = await cashPayment(headersA, cashAccountAId, '2026-09-10', 'REFUND', [
    { description: 'Hoàn tiền khách', amount: 40000 },
  ]);
  const PC05 = await cashPayment(headersA, cashAccountAId, '2026-09-11', 'EXPENSE', [
    { description: 'Lương tháng 9', amount: 500000, categoryId: categories.tienLuong },
  ]);
  const reversed = await request(server)
    .post(`/cash-payments/${PC05}/reverse`)
    .set(headersA)
    .send({ reason: 'Chi nhầm' })
    .expect(201);
  const PC05R: string = reversed.body.reversal.id;

  const PC06 = await cashPayment(headersB, cashAccountBId, '2026-09-05', 'EXPENSE', [
    { description: 'Tiền điện chi nhánh B', amount: 30000, categoryId: categories.tienDien },
  ]);

  // PC-07: DRAFT — the API auto-posts, so the draft is written directly.
  const PC07 = randomUUID();
  await ds.query(
    `INSERT INTO cash_payments
       (id, organization_id, branch_id, created_by, voucher_date, status, purpose,
        cash_account_id, contra_account_id, total_amount, created_at, updated_at)
     VALUES ($1, $2, $3, $4, '2026-09-13', 'DRAFT', 'EXPENSE', $5, $6, 70000, NOW(), NOW())`,
    [PC07, seed.organizationId, branchAId, seed.userId, cashAccountAId, expenseGlId],
  );
  await ds.query(
    `INSERT INTO cash_payment_lines
       (id, organization_id, branch_id, created_by, cash_payment_id, line_order,
        description, category_id, amount, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 'Tiền điện (nháp)', $5, 70000, NOW(), NOW())`,
    [seed.organizationId, branchAId, seed.userId, PC07, categories.tienDien],
  );

  return {
    branchAId,
    branchBId,
    adminRoleId,
    cashAccountAId,
    cashAccountBId,
    depositAccountAId,
    categories,
    vouchers: {
      PT01,
      PT02,
      PT03,
      PT04,
      PT05,
      PTG01,
      PC01,
      PC02,
      PC03,
      PC04,
      PC05,
      PC05R,
      PC06,
      PC07,
    },
    branchBUser,
  };
}
