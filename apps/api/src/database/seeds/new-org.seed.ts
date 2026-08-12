/**
 * Seed a brand-new organization: same baseline as `org-baseline.seed.ts` (admin user,
 * the four RBAC roles, org-wide COA, default accounts, payment accounts, cash voucher
 * categories, membership card types) but with freshly generated IDs — so, unlike
 * `org-baseline.seed.ts` (one fixed demo org, re-run just upserts it), each run of
 * this script creates a NEW, additional organization. Seeds NO branches, storages,
 * showrooms, products, or items; log in and create those through the app.
 *
 * Configure via env vars (all optional):
 *   ORG_NAME        organization display name       default: "New Company"
 *   ADMIN_EMAIL     admin login email                default: "admin@erp.local"
 *   ADMIN_PASSWORD  admin login password (plaintext) default: "password123"
 *
 * Run:
 *   pnpm --filter @erp/api seed:new-org
 *   ORG_NAME="Acme Retail" ADMIN_EMAIL="admin@acme.local" pnpm --filter @erp/api seed:new-org
 */
import { randomUUID } from 'crypto';
import { AppDataSource } from '../data-source';
import { AccountingDefaultAccountRole } from '../../modules/accounting/payment-accounts/enums';
import { OrgBaselineSeedIds, seedOrgBaselineData } from './org-baseline-seed.core';

const ORGANIZATION_NAME = process.env.ORG_NAME ?? 'New Company';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@erp.local';
const ADMIN_PLAIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'password123';

function generateIds(): OrgBaselineSeedIds {
  return {
    organization: randomUUID(),
    user: randomUUID(),
    roleSystemAdmin: randomUUID(),
    roleGeneralManager: randomUUID(),
    roleBranchManager: randomUUID(),
    roleSales: randomUUID(),
    roleCashier: randomUUID(),
    roleWarehouse: randomUUID(),
    defaultAccount: {
      [AccountingDefaultAccountRole.REVENUE]: randomUUID(),
      [AccountingDefaultAccountRole.RECEIVABLE]: randomUUID(),
      [AccountingDefaultAccountRole.OTHER_INCOME]: randomUUID(),
      [AccountingDefaultAccountRole.PAYABLE]: randomUUID(),
      [AccountingDefaultAccountRole.EXPENSE]: randomUUID(),
    },
    paymentAccount: {
      cash: randomUUID(),
      bank_transfer: randomUUID(),
      card: randomUUID(),
    },
  };
}

async function seedNewOrg() {
  await AppDataSource.initialize();

  const ids = generateIds();

  try {
    await seedOrgBaselineData({
      ids,
      organizationName: ORGANIZATION_NAME,
      adminEmail: ADMIN_EMAIL,
      adminPasswordPlain: ADMIN_PLAIN_PASSWORD,
    });

    // eslint-disable-next-line no-console
    console.log(
      [
        'New organization seeded (no branches, no products).',
        `  Organization ID: ${ids.organization}`,
        `  Organization:    ${ORGANIZATION_NAME}`,
        `  Email:           ${ADMIN_EMAIL}`,
        `  Password:        ${ADMIN_PLAIN_PASSWORD}`,
        '  Next: log in, then create branches and products manually.',
      ].join('\n'),
    );
  } finally {
    await AppDataSource.destroy();
  }
}

seedNewOrg().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('New-org seed failed:', error);
  process.exitCode = 1;
});
