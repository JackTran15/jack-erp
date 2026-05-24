import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import {
  sortMergedPartners,
  searchVoucherCustomers,
  searchVoucherProviders,
  toMergedCustomer,
  toMergedProvider,
  type VoucherMergedPartnerOption,
} from "../_shared/voucher-partner-search";
import { VoucherPartnerKindUi } from "../_shared/voucher-partner.constants";

const MERGE_SOURCE_PAGE_SIZE = 100;

function itemsFromSearchResult<T>(
  result: LookupSearchResult<T> | T[],
): T[] {
  return Array.isArray(result) ? result : (result.items ?? []);
}

export async function searchVoucherDebtCollectionParties(
  query: string,
  page: number,
  pageSize = 8,
): Promise<LookupSearchResult<VoucherMergedPartnerOption>> {
  const [customerRes, partnerRes] = await Promise.all([
    searchVoucherCustomers(query, 1, MERGE_SOURCE_PAGE_SIZE),
    searchVoucherProviders(
      VoucherPartnerKindUi.PARTNER,
      query,
      1,
      MERGE_SOURCE_PAGE_SIZE,
    ),
  ]);

  const merged = sortMergedPartners([
    ...itemsFromSearchResult(customerRes).map(toMergedCustomer),
    ...itemsFromSearchResult(partnerRes).map(toMergedProvider),
  ]);

  const start = (page - 1) * pageSize;
  const items = merged.slice(start, start + pageSize);
  return {
    items,
    hasMore: start + pageSize < merged.length,
    total: merged.length,
  };
}
