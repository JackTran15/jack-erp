import { describe, expect, it } from "vitest";
import { CashVoucherPartnerType } from "../../cash-vouchers.types";
import {
  DEBT_COLLECTION_PARTNER_OPTIONS,
  PARTNER_LOOKUP_DIALOG_OPTIONS,
  PartnerLookupType,
  inferLookupType,
  isFreeTextLookupType,
  lookupTypeToPartnerType,
} from "./voucher-partner.constants";

describe("partner lookup kinds", () => {
  it("offers Khác alongside the three catalogue kinds on the Đối tượng dialog", () => {
    expect(PARTNER_LOOKUP_DIALOG_OPTIONS.map((o) => o.value)).toEqual([
      PartnerLookupType.SUPPLIER,
      PartnerLookupType.CUSTOMER,
      PartnerLookupType.EMPLOYEE,
      PartnerLookupType.OTHER,
    ]);
  });

  it("leaves the debt-collection dialog restricted to customers", () => {
    // Thu nợ settles invoice debt, which only a customer can owe. Adding Khác
    // here would offer a party that can never have a debt to collect.
    expect(DEBT_COLLECTION_PARTNER_OPTIONS.map((o) => o.value)).toEqual([
      PartnerLookupType.CUSTOMER,
    ]);
  });

  it("round-trips OTHER between the form kind and the persisted party type", () => {
    expect(lookupTypeToPartnerType(PartnerLookupType.OTHER)).toBe(
      CashVoucherPartnerType.OTHER,
    );
    expect(inferLookupType(CashVoucherPartnerType.OTHER)).toBe(
      PartnerLookupType.OTHER,
    );
  });

  it("still maps the three catalogue kinds both ways", () => {
    for (const [lookup, partner] of [
      [PartnerLookupType.CUSTOMER, CashVoucherPartnerType.CUSTOMER],
      [PartnerLookupType.SUPPLIER, CashVoucherPartnerType.SUPPLIER],
      [PartnerLookupType.EMPLOYEE, CashVoucherPartnerType.EMPLOYEE],
    ] as const) {
      expect(lookupTypeToPartnerType(lookup)).toBe(partner);
      expect(inferLookupType(partner)).toBe(lookup);
    }
  });

  it("treats only OTHER as free text", () => {
    expect(isFreeTextLookupType(PartnerLookupType.OTHER)).toBe(true);
    for (const k of [
      PartnerLookupType.CUSTOMER,
      PartnerLookupType.SUPPLIER,
      PartnerLookupType.EMPLOYEE,
      PartnerLookupType.ALL,
    ]) {
      expect(isFreeTextLookupType(k)).toBe(false);
    }
  });

  it("keeps ALL out of the saved party types by never offering it as a kind", () => {
    // ALL is a filter value only. It maps to OTHER defensively, but it must not
    // be reachable from the dialog's dropdown, or a filter would become a party.
    expect(
      PARTNER_LOOKUP_DIALOG_OPTIONS.some(
        (o) => o.value === PartnerLookupType.ALL,
      ),
    ).toBe(false);
  });
});
