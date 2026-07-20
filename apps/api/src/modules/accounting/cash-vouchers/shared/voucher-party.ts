import { EntityManager } from 'typeorm';
import { CashVoucherPartnerType } from '../enums';
import { PartnerResolverService } from './partner-resolver.service';

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
