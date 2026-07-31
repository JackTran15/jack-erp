/**
 * Org baseline seed: an organization, an admin user, the four RBAC roles, and the
 * org-wide accounting/customer foundation — and NOTHING branch- or product-scoped.
 *
 * Unlike `inventory.seed.ts`, this seeds NO branches, storages, locations, showrooms,
 * cash funds, products, items, or sample customers. The admin logs in (branchless,
 * `branchIds: []`) and creates branches, products, and stock manually through the app.
 * What it seeds mirrors what `OrganizationService.create()` provisions for a runtime
 * org (COA, default-account roles, cash-voucher categories, membership card types),
 * plus org-wide `payment_accounts` so POS checkout resolves without 400s once a branch
 * exists. Reuses the shared data tables (`DEFAULT_COA`, `DEFAULT_CASH_VOUCHER_CATEGORIES`,
 * `DEFAULT_MEMBERSHIP_CARD_TYPES`, `PERMISSION_SEEDS`, role-permission key sets) — no
 * business data is duplicated here.
 *
 * This seeds ONE fixed, deterministic organization (re-running just upserts it in
 * place). To seed an additional, brand-new organization instead, use
 * `pnpm seed:new-org` (`new-org.seed.ts`), which generates fresh IDs each run.
 *
 * Credentials (sign in at backoffice /login):
 *   Organization ID:  f1000000-0000-4000-8000-000000000001
 *   Email:            admin@erp.local
 *   Password:         ADMIN_PLAIN_PASSWORD (constant below; bcrypt-hashed before insert)
 *   Role:            Quản trị hệ thống (system, full access)
 *
 * Run: pnpm --filter @erp/api seed:org
 *
 * Idempotent (ON CONFLICT / NOT EXISTS guards) — safe to re-run. To apply a new
 * password after changing ADMIN_PLAIN_PASSWORD, delete the seed user row first.
 */
import { AppDataSource } from '../data-source';
import { AccountingDefaultAccountRole } from '../../modules/accounting/payment-accounts/enums';
import { OrgBaselineSeedIds, seedOrgBaselineData } from './org-baseline-seed.core';

/** Plaintext admin login password — must match what you type in the login form. */
const ADMIN_PLAIN_PASSWORD = 'password123';
const ADMIN_EMAIL = 'admin@erp.local';
const ORGANIZATION_NAME = 'My Company';

/** Deterministic UUIDs in a namespace distinct from inventory.seed.ts (`1x/3x/4x…`). */
const IDS: OrgBaselineSeedIds = {
  organization: 'f1000000-0000-4000-8000-000000000001',
  user: 'f1000000-0000-4000-8000-000000000031',
  roleSystemAdmin: 'f1000000-0000-4000-8000-000000000041',
  roleGeneralManager: 'f1000000-0000-4000-8000-000000000042',
  roleBranchManager: 'f1000000-0000-4000-8000-000000000043',
  roleStaff: 'f1000000-0000-4000-8000-000000000044',
  // Deterministic ids so default-account / payment-account rows dedupe on re-run
  // (branch_id NULL makes a (org, role, branch) unique index treat NULLs as distinct).
  defaultAccount: {
    REVENUE: 'f1000000-0000-4000-8000-000000000051',
    RECEIVABLE: 'f1000000-0000-4000-8000-000000000052',
    OTHER_INCOME: 'f1000000-0000-4000-8000-000000000053',
    PAYABLE: 'f1000000-0000-4000-8000-000000000054',
    EXPENSE: 'f1000000-0000-4000-8000-000000000055',
  } as Record<AccountingDefaultAccountRole, string>,
  paymentAccount: {
    cash: 'f1000000-0000-4000-8000-000000000061',
    bank_transfer: 'f1000000-0000-4000-8000-000000000062',
    card: 'f1000000-0000-4000-8000-000000000063',
  } as Record<string, string>,
};

async function seedOrgBaseline() {
  await AppDataSource.initialize();

  try {
    await seedOrgBaselineData({
      ids: IDS,
      organizationName: ORGANIZATION_NAME,
      adminEmail: ADMIN_EMAIL,
      adminPasswordPlain: ADMIN_PLAIN_PASSWORD,
    });

    // eslint-disable-next-line no-console
    console.log(
      [
        'Org baseline seed completed (no branches, no products).',
        `  Organization ID: ${IDS.organization}`,
        `  Email:           ${ADMIN_EMAIL}`,
        `  Password:        ${ADMIN_PLAIN_PASSWORD}`,
        '  Next: log in, then create branches and products manually.',
      ].join('\n'),
    );
  } finally {
    await AppDataSource.destroy();
  }
}

seedOrgBaseline().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Org baseline seed failed:', error);
  process.exitCode = 1;
});
