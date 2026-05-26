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

interface SupplierWithDebtRow {
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  debtCount: number;
  totalOriginal: number;
  totalRemaining: number;
  earliestDueDate: string | null;
  hasOverdue: boolean;
}

interface SuppliersWithDebtResponse {
  data: SupplierWithDebtRow[];
  total: number;
  page: number;
  pageSize: number;
}

function supplierDebtRowToOption(
  row: SupplierWithDebtRow,
): VoucherPartnerOption {
  return {
    lookupKey: `${PartnerLookupType.SUPPLIER}:${row.supplierId}`,
    id: row.supplierId,
    code: row.supplierCode ?? "",
    name: row.supplierName,
    kind: PartnerLookupType.SUPPLIER,
    kindLabel: PARTNER_LOOKUP_LABEL[PartnerLookupType.SUPPLIER],
  };
}

const STALE_TIME = 30_000;

async function fetchSupplierDebtParties(
  query: string,
  page: number,
  pageSize: number,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  const params: Record<string, string | number> = { page, pageSize };
  const q = query.trim();
  if (q) params.search = q;

  const { data } = await apiClient.get<SuppliersWithDebtResponse>(
    "/cash-vouchers/partners/suppliers-with-debt",
    { params },
  );

  const items = (data?.data ?? []).map(supplierDebtRowToOption);
  const total = data?.total ?? 0;
  const fetched = (data?.page ?? page) * (data?.pageSize ?? pageSize);

  return {
    items,
    hasMore: fetched < total,
    total,
  };
}

export function searchSupplierDebtParties(
  qc: QueryClient,
  query: string,
  page: number,
  pageSize = 50,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.supplierDebtParties(query.trim(), page, pageSize),
    queryFn: () => fetchSupplierDebtParties(query, page, pageSize),
    staleTime: STALE_TIME,
  });
}

export function useSupplierDebtSearch() {
  const qc = useQueryClient();
  return useCallback(
    (query: string, page: number, pageSize = 50) =>
      searchSupplierDebtParties(qc, query, page, pageSize),
    [qc],
  );
}
