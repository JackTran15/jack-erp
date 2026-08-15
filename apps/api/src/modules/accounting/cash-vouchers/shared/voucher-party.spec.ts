import { EntityManager } from 'typeorm';
import { buildPosInvoiceParty } from './voucher-party';
import { CashVoucherPartnerType } from '../enums';

/**
 * Row shape returned by the single LEFT JOIN query in `buildPosInvoiceParty`.
 * Kept local so a column rename in the query shows up as a compile error here.
 */
interface PartyRow {
  customer_id: string | null;
  staff_id: string | null;
  salesperson_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  branch_address: string | null;
  salesperson_user_id: string | null;
}

const ORG = 'org-1';
const INVOICE = 'inv-1';

function row(overrides: Partial<PartyRow> = {}): PartyRow {
  return {
    customer_id: 'cust-1',
    staff_id: 'user-cashier',
    salesperson_id: 'profile-1',
    customer_name: 'Nguyễn Văn A',
    customer_address: '12 Lê Lợi',
    branch_address: '45 Nguyễn Huệ',
    salesperson_user_id: 'user-salesperson',
    ...overrides,
  };
}

/** A manager stubbed down to the one method the function uses. */
function managerReturning(rows: PartyRow[]): {
  manager: EntityManager;
  query: jest.Mock;
} {
  const query = jest.fn().mockResolvedValue(rows);
  return { manager: { query } as unknown as EntityManager, query };
}

describe('buildPosInvoiceParty', () => {
  it('maps customer, address and salesperson onto the snapshot (AC-01)', async () => {
    const { manager } = managerReturning([row()]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party).toEqual({
      partnerType: CashVoucherPartnerType.CUSTOMER,
      partnerId: 'cust-1',
      partnerName: 'Nguyễn Văn A',
      partnerAddress: '12 Lê Lợi',
      personName: 'Nguyễn Văn A',
      staffId: 'user-salesperson',
    });
  });

  it('puts the salesperson USER id in staffId, not the employee profile id (AC-01, A-R3)', async () => {
    // Guards A-R3: invoices.salesperson_id is an employee_profiles.id, but the voucher
    // dialog resolves staffId through GET /admin/users/:id. Writing the profile id here
    // keeps every other assertion green and still renders an empty "Nhân viên thu".
    const { manager } = managerReturning([row()]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.staffId).toBe('user-salesperson');
    expect(party.staffId).not.toBe('profile-1');
  });

  it('falls back to the branch address when the customer has none (AC-03)', async () => {
    const { manager } = managerReturning([row({ customer_address: null })]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.partnerAddress).toBe('45 Nguyễn Huệ');
  });

  it('treats a whitespace-only customer address as absent (AC-03)', async () => {
    const { manager } = managerReturning([row({ customer_address: '   ' })]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.partnerAddress).toBe('45 Nguyễn Huệ');
  });

  it('leaves the partner fields empty for a walk-in sale but still fills the rest (AC-02)', async () => {
    const { manager } = managerReturning([
      row({ customer_id: null, customer_name: null, customer_address: null }),
    ]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.partnerType).toBeUndefined();
    expect(party.partnerId).toBeUndefined();
    expect(party.partnerName).toBeUndefined();
    expect(party.personName).toBeUndefined();
    expect(party.partnerAddress).toBe('45 Nguyễn Huệ');
    expect(party.staffId).toBe('user-salesperson');
  });

  it('falls back to the invoice creator when the sale has no salesperson (AC-04)', async () => {
    const { manager } = managerReturning([
      row({ salesperson_id: null, salesperson_user_id: null }),
    ]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.staffId).toBe('user-cashier');
  });

  it('falls back to the invoice creator when the salesperson has no linked user (AC-04)', async () => {
    // An employee_profiles row exists but its user_id is null / the profile is gone —
    // the LEFT JOIN yields a salesperson_id with no user behind it.
    const { manager } = managerReturning([row({ salesperson_user_id: null })]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.staffId).toBe('user-cashier');
  });

  it('does not throw when the customer id resolves to nothing (AC-14, A-R4)', async () => {
    // PartnerResolverService throws a 400 here on purpose — the manual voucher form needs
    // that. On the POS path the same throw would DLQ a receipt, or in the v2 saga kill the
    // whole sale, so this function must degrade instead.
    const { manager } = managerReturning([
      row({ customer_name: null, customer_address: null }),
    ]);

    const party = await buildPosInvoiceParty(manager, INVOICE, ORG);

    expect(party.partnerType).toBeUndefined();
    expect(party.partnerId).toBeUndefined();
    expect(party.partnerName).toBeUndefined();
    expect(party.staffId).toBe('user-salesperson');
  });

  it('returns an empty snapshot when the invoice is not found (AC-14)', async () => {
    const { manager } = managerReturning([]);

    await expect(buildPosInvoiceParty(manager, INVOICE, ORG)).resolves.toEqual({});
  });

  it('casts branch_id when joining branches, and scopes by organization', async () => {
    // invoices.branch_id is varchar while branches.id is uuid — without the cast this
    // query fails at runtime, and a stubbed manager would never notice. Asserting on the
    // SQL text is the only guard a unit test can offer; T-01-02 also runs it for real.
    const { manager, query } = managerReturning([row()]);

    await buildPosInvoiceParty(manager, INVOICE, ORG);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('::uuid');
    expect(params).toEqual([INVOICE, ORG]);
  });
});
