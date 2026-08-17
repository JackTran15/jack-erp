import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CashVoucherPartnerType } from '../enums';
import { PartnerResolverService } from './partner-resolver.service';

const logger = new Logger('voucherParty');

/**
 * The party/staff fields an auto-generated voucher inherits from the voucher (or
 * form) that produced it. Mirrors the carry-over set `BankPaymentsService.reverseInTx`
 * already uses when it clones a voucher into its reversal.
 *
 * Field names are deliberately neutral because the target column differs per
 * table — callers map them:
 *   personName -> bank_payments.payee_name | bank_receipts.payer_name
 *                 cash_payments.payee_name | cash_receipts.payer_name
 *   staffId    -> bank_payments.paid_by | bank_receipts.collected_by
 *                 cash_payments.staff_id | cash_receipts.staff_id
 */
export interface VoucherPartySnapshot {
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  /** Frozen onto partner_name_snapshot. */
  partnerName?: string;
  /** Frozen onto partner_address_snapshot. */
  partnerAddress?: string;
  personName?: string;
  staffId?: string;
  reason?: string;
  reference?: string;
}

export interface VoucherPartyInput {
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  personName?: string;
  /** Caller-supplied address; only used when the partner lookup yields none. */
  address?: string;
  staffId?: string;
  reason?: string;
  reference?: string;
}

/**
 * Build the snapshot for a voucher about to be created, resolving the partner's
 * name/address whenever a typed partnerId is present.
 *
 * Resolving is the point: passing `partnerId` without ever calling the resolver
 * leaves partner_name_snapshot NULL, which is what made supplier payments show a
 * blank counterparty in the deposit voucher list.
 */
export async function resolvePartySnapshot(
  manager: EntityManager,
  resolver: PartnerResolverService,
  input: VoucherPartyInput,
  organizationId: string,
): Promise<VoucherPartySnapshot> {
  const partner = await resolver.resolve(
    manager,
    input.partnerType,
    input.partnerId,
    organizationId,
  );

  return {
    partnerType: input.partnerType,
    partnerId: input.partnerId,
    partnerName: blankToUndefined(partner?.name),
    // A partner record with a blank address must fall through to the address
    // typed on the form — `??` alone would keep the empty string.
    partnerAddress:
      blankToUndefined(partner?.address) ?? blankToUndefined(input.address),
    personName: blankToUndefined(input.personName),
    staffId: input.staffId,
    reason: input.reason,
    reference: input.reference,
  };
}

/** Treat null/undefined/whitespace-only alike, so fallbacks actually fire. */
function blankToUndefined(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** One row of {@link POS_INVOICE_PARTY_SQL}. */
interface PosInvoicePartyRow {
  customer_id: string | null;
  staff_id: string | null;
  salesperson_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  branch_address: string | null;
  salesperson_user_id: string | null;
}

/**
 * `invoices.branch_id` is a varchar while `branches.id` is a uuid, hence the cast — without
 * it this fails at runtime, not at compile time.
 *
 * Parameterised SQL rather than entity lookups, same as `PartnerResolverService`: it keeps
 * the cash-vouchers module from depending on the pos / customer / rbac entity classes.
 */
const POS_INVOICE_PARTY_SQL = `
  SELECT i."customer_id", i."staff_id", i."salesperson_id",
         c."name"    AS "customer_name",
         c."address" AS "customer_address",
         b."address" AS "branch_address",
         ep."user_id" AS "salesperson_user_id"
  FROM "invoices" i
  LEFT JOIN "customers" c
         ON c."id" = i."customer_id" AND c."organization_id" = i."organization_id"
  LEFT JOIN "branches" b
         ON b."id" = i."branch_id"::uuid
  LEFT JOIN "employee_profiles" ep
         ON ep."id" = i."salesperson_id" AND ep."organization_id" = i."organization_id"
  WHERE i."id" = $1 AND i."organization_id" = $2
  LIMIT 1
`;

/**
 * The party fields a voucher auto-generated from a POS invoice inherits: who paid, where they
 * live, and which staff member handled the money.
 *
 * **Never throws.** Deliberately does not reuse {@link PartnerResolverService}, which raises a
 * 400 for an unresolvable partner id — the manual voucher form needs that, but here the same
 * throw would dead-letter a receipt for money already taken, and inside the v2 checkout
 * transaction it would lose the whole sale over a display field. Missing rows degrade to
 * undefined; only genuine infrastructure faults propagate.
 *
 * `staffId` carries the salesperson's **users.id**, reached through
 * `employee_profiles.user_id`: `invoices.salesperson_id` is an `employee_profiles.id`, while
 * the voucher dialog resolves this field via `GET /admin/users/:id`. Writing the profile id
 * would populate the column and still render an empty "Nhân viên thu".
 */
export async function buildPosInvoiceParty(
  manager: EntityManager,
  invoiceId: string,
  organizationId: string,
): Promise<VoucherPartySnapshot> {
  const rows: PosInvoicePartyRow[] = await manager.query(POS_INVOICE_PARTY_SQL, [
    invoiceId,
    organizationId,
  ]);
  const row = rows?.[0];
  if (!row) {
    logger.warn(
      `No invoice ${invoiceId} in organization ${organizationId} — voucher party left empty`,
    );
    return {};
  }

  // A customer row that did not join back (hard-deleted, or an id from another org) leaves
  // the party blank rather than pointing the voucher at an id nothing can resolve.
  const customerName = blankToUndefined(row.customer_name);
  const hasCustomer = Boolean(row.customer_id && customerName);

  return {
    partnerType: hasCustomer ? CashVoucherPartnerType.CUSTOMER : undefined,
    partnerId: hasCustomer ? (row.customer_id ?? undefined) : undefined,
    partnerName: hasCustomer ? customerName : undefined,
    partnerAddress:
      blankToUndefined(row.customer_address) ?? blankToUndefined(row.branch_address),
    personName: hasCustomer ? customerName : undefined,
    staffId: row.salesperson_user_id ?? row.staff_id ?? undefined,
  };
}

/**
 * Carry a snapshot from an already-persisted voucher onto its counterpart leg,
 * so the generated voucher shows the same party as the one that produced it.
 */
export function partySnapshotFromVoucher(source: {
  partnerType?: string | null;
  partnerId?: string | null;
  partnerNameSnapshot?: string | null;
  partnerAddressSnapshot?: string | null;
  personName?: string | null;
  staffId?: string | null;
  reason?: string | null;
  reference?: string | null;
}): VoucherPartySnapshot {
  return {
    partnerType: (source.partnerType as CashVoucherPartnerType) ?? undefined,
    partnerId: source.partnerId ?? undefined,
    partnerName: source.partnerNameSnapshot ?? undefined,
    partnerAddress: source.partnerAddressSnapshot ?? undefined,
    personName: source.personName ?? undefined,
    staffId: source.staffId ?? undefined,
    reason: source.reason ?? undefined,
    reference: source.reference ?? undefined,
  };
}
