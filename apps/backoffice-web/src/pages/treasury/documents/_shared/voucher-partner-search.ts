import type { UserListItem } from "@erp/shared-interfaces";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "../../../../lib/api-axios";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { CashVoucherPartnerType } from "../../cash-vouchers.types";
import { treasuryQueryKeys } from "../../../../hooks/treasury/treasury-query-keys";
import {
  PartnerLookupType,
  PARTNER_LOOKUP_LABEL,
} from "./voucher-partner.constants";

// ── Response shape from GET /cash-vouchers/partners ──────────────

interface PartnerLookupRow {
  type: PartnerLookupType.EMPLOYEE | PartnerLookupType.CUSTOMER | PartnerLookupType.SUPPLIER;
  id: string;
  name: string;
  code: string | null;
  address: string | null;
}

interface PartnerLookupResponse {
  data: PartnerLookupRow[];
  total: number;
  page: number;
  pageSize: number;
}

const SEARCH_STALE_TIME = 30_000;
const DETAIL_STALE_TIME = 5 * 60_000;

// ── Public types ─────────────────────────────────────────────────

export interface VoucherPartnerOption {
  lookupKey: string;
  id: string;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  kind: PartnerLookupType;
  kindLabel: string;
}

/** Pin the current selection on page 1 (API search may not match by code). */
export function mergePartnerSearchWithSelection(
  result: LookupSearchResult<VoucherPartnerOption>,
  current: VoucherPartnerOption | null,
  page: number,
): LookupSearchResult<VoucherPartnerOption> {
  if (!current || page !== 1) return result;
  const items = Array.isArray(result)
    ? result
    : (result.items ?? []);
  if (items.some((i) => i.lookupKey === current.lookupKey)) return result;
  const merged = [current, ...items];
  if (Array.isArray(result)) return merged;
  return {
    items: merged,
    hasMore: Boolean(result.hasMore),
    total: (result.total ?? items.length) + 1,
  };
}

// ── Raw fetch functions (used as queryFn) ────────────────────────

function partnerRowToOption(row: PartnerLookupRow): VoucherPartnerOption {
  const code = row.code ?? "";
  const kind = row.type as PartnerLookupType;
  return {
    lookupKey: `${kind}:${row.id}`,
    id: row.id,
    code,
    name: row.name,
    address: row.address ?? undefined,
    kind,
    kindLabel: PARTNER_LOOKUP_LABEL[kind],
  };
}

async function fetchPartnerSearch(
  type: PartnerLookupType,
  query: string,
  page: number,
  pageSize: number,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  const params: Record<string, string | number> = { type, page, pageSize };
  const q = query.trim();
  if (q) params.search = q;
  const { data } = await apiClient.get<PartnerLookupResponse>(
    "/cash-vouchers/partners",
    { params },
  );
  const items = data.data.map(partnerRowToOption);
  const fetched = data.page * data.pageSize;
  return {
    items,
    hasMore: fetched < data.total,
    total: data.total,
  };
}

interface VoucherPartnerByIdResult {
  code: string;
  name: string;
  phone?: string;
  address?: string;
  kind: PartnerLookupType;
}

function toStaffOption(data: UserListItem): {
  id: string;
  code: string;
  name: string;
  phone?: string;
} {
  return {
    id: data.id,
    code: data.code ?? data.profile?.code ?? "",
    name: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.email,
    phone: data.profile?.mobile ?? undefined,
  };
}

async function fetchStaffByIdRaw(
  id: string,
): Promise<{ id: string; code: string; name: string; phone?: string } | null> {
  try {
    const { data } = await apiClient.get<UserListItem>(`/admin/users/${id}`);
    return toStaffOption(data);
  } catch {
    return null;
  }
}

/**
 * The signed-in user, for prefilling "Nhân viên thu/chi" on a new voucher.
 *
 * Uses `/admin/users/me` rather than `/admin/users/:id`: the by-id endpoint is
 * gated behind `iam.user.read`, which treasury staff generally do not hold, so
 * the prefill silently came back empty for exactly the people who use the form.
 */
async function fetchCurrentStaffRaw(): Promise<{
  id: string;
  code: string;
  name: string;
  phone?: string;
} | null> {
  try {
    const { data } = await apiClient.get<UserListItem>("/admin/users/me");
    return toStaffOption(data);
  } catch {
    return null;
  }
}

async function fetchPartnerByTypeRaw(
  partnerType: CashVoucherPartnerType,
  partnerId: string,
): Promise<VoucherPartnerByIdResult | null> {
  if (partnerType === CashVoucherPartnerType.CUSTOMER) {
    try {
      const { data } = await apiClient.get<{ id: string; code: string; name: string; phone?: string; address?: string }>(
        `/customers/${partnerId}`,
      );
      return {
        code: data.code,
        name: data.name,
        phone: data.phone,
        address: data.address,
        kind: PartnerLookupType.CUSTOMER,
      };
    } catch {
      return null;
    }
  }

  if (partnerType === CashVoucherPartnerType.EMPLOYEE) {
    const u = await fetchStaffByIdRaw(partnerId);
    if (!u) return null;
    return { code: u.code, name: u.name, phone: u.phone, kind: PartnerLookupType.EMPLOYEE };
  }

  if (partnerType === CashVoucherPartnerType.SUPPLIER) {
    try {
      const { data } = await apiClient.get<{
        id: string;
        code: string;
        name: string;
        phone?: string;
        address?: string;
      }>(`/inventory/providers/${partnerId}`);
      return {
        code: data.code,
        name: data.name,
        phone: data.phone,
        address: data.address,
        kind: PartnerLookupType.SUPPLIER,
      };
    } catch {
      return null;
    }
  }

  return null;
}

// ── Cached functions (via queryClient.fetchQuery) ────────────────

export function searchVoucherPartners(
  qc: QueryClient,
  type: PartnerLookupType,
  query: string,
  page: number,
  pageSize = 50,
): Promise<LookupSearchResult<VoucherPartnerOption>> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.partnerSearch(type, query.trim(), page, pageSize),
    queryFn: () => fetchPartnerSearch(type, query, page, pageSize),
    staleTime: SEARCH_STALE_TIME,
  });
}

export function fetchVoucherStaffById(
  qc: QueryClient,
  id: string,
): Promise<{ id: string; code: string; name: string; phone?: string } | null> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.staffById(id),
    queryFn: () => fetchStaffByIdRaw(id),
    staleTime: DETAIL_STALE_TIME,
  });
}

export function fetchVoucherPartnerByType(
  qc: QueryClient,
  partnerType: CashVoucherPartnerType | undefined,
  partnerId: string | undefined,
): Promise<VoucherPartnerByIdResult | null> {
  if (!partnerType || !partnerId) return Promise.resolve(null);
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.partnerById(partnerType, partnerId),
    queryFn: () => fetchPartnerByTypeRaw(partnerType, partnerId),
    staleTime: DETAIL_STALE_TIME,
  });
}

// ── Hooks (convenience wrappers for components) ──────────────────

export function usePartnerSearch() {
  const qc = useQueryClient();
  return useCallback(
    (type: PartnerLookupType, query: string, page: number, pageSize = 50) =>
      searchVoucherPartners(qc, type, query, page, pageSize),
    [qc],
  );
}

export function fetchCurrentVoucherStaff(
  qc: QueryClient,
): Promise<{ id: string; code: string; name: string; phone?: string } | null> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.staffById("me"),
    queryFn: fetchCurrentStaffRaw,
    staleTime: DETAIL_STALE_TIME,
  });
}

export function usePartnerLookup() {
  const qc = useQueryClient();
  return {
    fetchPartnerByType: useCallback(
      (partnerType: CashVoucherPartnerType | undefined, partnerId: string | undefined) =>
        fetchVoucherPartnerByType(qc, partnerType, partnerId),
      [qc],
    ),
    fetchStaffById: useCallback(
      (id: string) => fetchVoucherStaffById(qc, id),
      [qc],
    ),
    fetchCurrentStaff: useCallback(() => fetchCurrentVoucherStaff(qc), [qc]),
  };
}
