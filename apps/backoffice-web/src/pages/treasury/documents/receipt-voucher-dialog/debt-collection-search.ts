import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "../../../../lib/api-axios";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { treasuryQueryKeys } from "../../../../hooks/treasury/treasury-query-keys";
import {
  PARTNER_LOOKUP_LABEL,
  PartnerLookupType,
} from "../_shared/voucher-partner.constants";
import type { VoucherPartnerOption } from "../_shared/voucher-partner-search";

interface CustomerWithDebtRow {
  customerId: string;
  customerName: string;
  customerCode: string | null;
  debtCount: number;
  totalOriginal: number;
  totalRemaining: number;
  earliestDueDate: string | null;
  hasOverdue: boolean;
}

interface CustomersWithDebtResponse {
  data: CustomerWithDebtRow[];
  total: number;
  page: number;
  pageSize: number;
}

function customerDebtRowToOption(
  row: CustomerWithDebtRow,
): VoucherPartnerOption {
  return {
    lookupKey: `${PartnerLookupType.CUSTOMER}:${row.customerId}`,
    id: row.customerId,
    code: row.customerCode ?? "",
    name: row.customerName,
    kind: PartnerLookupType.CUSTOMER,
    kindLabel: PARTNER_LOOKUP_LABEL[PartnerLookupType.CUSTOMER],
  };
}

const STALE_TIME = 30_000;

async function fetchDebtCollectionParties(
  query: string,
  page: number,
  pageSize: number,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  const params: Record<string, string | number> = { page, pageSize };
  const q = query.trim();
  if (q) params.search = q;

  const { data } = await apiClient.get<CustomersWithDebtResponse>(
    "/cash-vouchers/partners/customers-with-debt",
    { params },
  );

  const items = (data?.data ?? []).map(customerDebtRowToOption);
  const total = data?.total ?? 0;
  const fetched = (data?.page ?? page) * (data?.pageSize ?? pageSize);

  return {
    items,
    hasMore: fetched < total,
    total,
  };
}

export function searchVoucherDebtCollectionParties(
  qc: QueryClient,
  query: string,
  page: number,
  pageSize = 50,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.debtCollectionParties(query.trim(), page, pageSize),
    queryFn: () => fetchDebtCollectionParties(query, page, pageSize),
    staleTime: STALE_TIME,
  });
}

export function useDebtCollectionSearch() {
  const qc = useQueryClient();
  return useCallback(
    (query: string, page: number, pageSize = 50) =>
      searchVoucherDebtCollectionParties(qc, query, page, pageSize),
    [qc],
  );
}
