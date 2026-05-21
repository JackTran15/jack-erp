import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CashVoucherPartnerType } from '../enums';

export interface ResolvedPartner {
  name: string | null;
  address: string | null;
}

/**
 * Resolves a polymorphic (partner_type, partner_id) reference against the
 * matching table (customers / inventory_providers / users) without a hard FK,
 * validating existence within the organization and returning a name/address
 * snapshot. Uses parameterized SQL to avoid coupling the cash-vouchers module to
 * those entity classes.
 */
@Injectable()
export class PartnerResolverService {
  /**
   * Validate the partner exists in the org and return its name/address for
   * freezing onto the voucher. Returns `null` for OTHER / missing partner type
   * (free-text partner, no validation). Throws 400 when a typed partner id does
   * not resolve.
   */
  async resolve(
    manager: EntityManager,
    partnerType: CashVoucherPartnerType | undefined,
    partnerId: string | undefined,
    organizationId: string,
  ): Promise<ResolvedPartner | null> {
    if (!partnerType || !partnerId || partnerType === CashVoucherPartnerType.OTHER) {
      return null;
    }

    let rows: Array<{ name: string | null; address: string | null }>;
    switch (partnerType) {
      case CashVoucherPartnerType.CUSTOMER:
        rows = await manager.query(
          `SELECT "name", "address" FROM "customers" WHERE "id" = $1 AND "organization_id" = $2 LIMIT 1`,
          [partnerId, organizationId],
        );
        break;
      case CashVoucherPartnerType.SUPPLIER:
        rows = await manager.query(
          `SELECT "name", "notes" AS "address" FROM "inventory_providers" WHERE "id" = $1 AND "organization_id" = $2 LIMIT 1`,
          [partnerId, organizationId],
        );
        break;
      case CashVoucherPartnerType.EMPLOYEE:
        rows = await manager.query(
          `SELECT (COALESCE("first_name", '') || ' ' || COALESCE("last_name", '')) AS "name", NULL AS "address" FROM "users" WHERE "id" = $1 AND "organization_id" = $2 LIMIT 1`,
          [partnerId, organizationId],
        );
        break;
      default:
        return null;
    }

    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        `Partner ${partnerType} ${partnerId} not found in organization`,
      );
    }

    const row = rows[0];
    return {
      name: row.name ? String(row.name).trim() : null,
      address: row.address ?? null,
    };
  }
}
