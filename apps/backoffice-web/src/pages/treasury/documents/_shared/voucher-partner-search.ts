import type { UserListItem } from "@erp/shared-interfaces";
import { apiClient } from "../../../../lib/api-axios";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { CashVoucherPartnerType } from "../../cash-vouchers.types";
import {
  VOUCHER_PARTNER_KIND_FILTER_ALL,
  VOUCHER_PARTNER_KIND_LABEL,
  VoucherPartnerKindUi,
  providerUiKindFromCode,
  type VoucherPartnerKindFilter,
} from "./voucher-partner.constants";

const MERGE_SOURCE_PAGE_SIZE = 100;

type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

export interface VoucherCustomerOption {
  id: string;
  code: string;
  name: string;
  phone?: string;
  address?: string;
}

export interface VoucherProviderOption {
  id: string;
  code: string;
  name: string;
  phone?: string;
}

export interface VoucherStaffOption {
  id: string;
  code: string;
  name: string;
  phone?: string;
}

export interface VoucherMergedPartnerOption {
  lookupKey: string;
  id: string;
  code: string;
  name: string;
  phone?: string;
  address?: string;
  kind: VoucherPartnerKindUi;
  kindLabel: string;
}

export function toMergedCustomer(c: VoucherCustomerOption): VoucherMergedPartnerOption {
  return {
    lookupKey: `${VoucherPartnerKindUi.CUSTOMER}:${c.id}`,
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    address: c.address,
    kind: VoucherPartnerKindUi.CUSTOMER,
    kindLabel: VOUCHER_PARTNER_KIND_LABEL[VoucherPartnerKindUi.CUSTOMER],
  };
}

export function toMergedProvider(p: VoucherProviderOption): VoucherMergedPartnerOption {
  const kind = providerUiKindFromCode(p.code);
  return {
    lookupKey: `${kind}:${p.id}`,
    id: p.id,
    code: p.code,
    name: p.name,
    phone: p.phone,
    kind,
    kindLabel: VOUCHER_PARTNER_KIND_LABEL[kind],
  };
}

function toMergedStaff(u: VoucherStaffOption): VoucherMergedPartnerOption {
  return {
    lookupKey: `${VoucherPartnerKindUi.EMPLOYEE}:${u.id}`,
    id: u.id,
    code: u.code,
    name: u.name,
    phone: u.phone,
    kind: VoucherPartnerKindUi.EMPLOYEE,
    kindLabel: VOUCHER_PARTNER_KIND_LABEL[VoucherPartnerKindUi.EMPLOYEE],
  };
}

export function sortMergedPartners(
  items: VoucherMergedPartnerOption[],
): VoucherMergedPartnerOption[] {
  return [...items].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, "vi");
    if (byName !== 0) return byName;
    return a.code.localeCompare(b.code, "vi");
  });
}

function itemsFromSearchResult<T>(
  result: LookupSearchResult<T> | T[],
): T[] {
  return Array.isArray(result) ? result : (result.items ?? []);
}

/** Pin the current selection on page 1 (API search may not match by code). */
export function mergePartnerSearchWithSelection(
  result: LookupSearchResult<VoucherMergedPartnerOption>,
  current: VoucherMergedPartnerOption | null,
  page: number,
): LookupSearchResult<VoucherMergedPartnerOption> {
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

/** One failed source must not clear the whole merged lookup. */
async function safePartnerSourceSearch<T>(
  label: string,
  fn: () => Promise<LookupSearchResult<T>>,
): Promise<T[]> {
  try {
    return itemsFromSearchResult(await fn());
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[voucher-partner] ${label}:`, err);
    }
    return [];
  }
}

function mapPaginatedToMerged<C>(
  raw: LookupSearchResult<C>,
  mapItem: (row: C) => VoucherMergedPartnerOption,
): LookupSearchResult<VoucherMergedPartnerOption> {
  const items = itemsFromSearchResult(raw).map(mapItem);
  if (Array.isArray(raw)) {
    return { items, hasMore: false, total: items.length };
  }
  return {
    items,
    hasMore: Boolean(raw.hasMore),
    total: raw.total ?? items.length,
  };
}

export async function searchVoucherPartnersByKind(
  kindFilter: VoucherPartnerKindFilter,
  query: string,
  page: number,
  pageSize = 50,
): Promise<LookupSearchResult<VoucherMergedPartnerOption>> {
  if (kindFilter === VOUCHER_PARTNER_KIND_FILTER_ALL) {
    return searchVoucherPartnersMerged(query, page, pageSize);
  }
  if (kindFilter === VoucherPartnerKindUi.CUSTOMER) {
    return mapPaginatedToMerged(
      await searchVoucherCustomers(query, page, pageSize),
      toMergedCustomer,
    );
  }
  if (kindFilter === VoucherPartnerKindUi.EMPLOYEE) {
    return mapPaginatedToMerged(
      await searchVoucherStaff(query, page, pageSize),
      toMergedStaff,
    );
  }
  if (
    kindFilter === VoucherPartnerKindUi.SUPPLIER ||
    kindFilter === VoucherPartnerKindUi.PARTNER
  ) {
    return mapPaginatedToMerged(
      await searchVoucherProviders(kindFilter, query, page, pageSize),
      toMergedProvider,
    );
  }
  return { items: [], hasMore: false, total: 0 };
}

/**
 * Merges customers, providers, and staff (3 APIs per request, client-side paging).
 * Prefer `searchVoucherPartnersByKind` for single-kind server paging.
 */
export async function searchVoucherPartnersMerged(
  query: string,
  page: number,
  pageSize = 8,
): Promise<LookupSearchResult<VoucherMergedPartnerOption>> {
  const [customerItems, providerItems, staffItems] = await Promise.all([
    safePartnerSourceSearch("customers", () =>
      searchVoucherCustomers(query, 1, MERGE_SOURCE_PAGE_SIZE),
    ),
    safePartnerSourceSearch("providers", () =>
      searchVoucherProvidersAll(query, 1, MERGE_SOURCE_PAGE_SIZE),
    ),
    safePartnerSourceSearch("staff", () =>
      searchVoucherStaff(query, 1, MERGE_SOURCE_PAGE_SIZE),
    ),
  ]);

  const merged = sortMergedPartners([
    ...customerItems.map(toMergedCustomer),
    ...providerItems.map(toMergedProvider),
    ...staffItems.map(toMergedStaff),
  ]);

  const start = (page - 1) * pageSize;
  const items = merged.slice(start, start + pageSize);
  return {
    items,
    hasMore: start + pageSize < merged.length,
    total: merged.length,
  };
}

async function searchVoucherProvidersAll(
  query: string,
  page: number,
  pageSize: number,
): Promise<LookupSearchResult<VoucherProviderOption>> {
  const { data } = await apiClient.get<Paginated<VoucherProviderOption>>(
    `/inventory/providers?${buildListParams(query, page, pageSize)}`,
  );
  return paginate(data, page, pageSize);
}

function paginate<T>(
  data: Paginated<T> | null | undefined,
  page: number,
  pageSize: number,
): LookupSearchResult<T> {
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const currentPage = data?.page ?? page;
  const currentPageSize = data?.pageSize ?? pageSize;
  const fetched = currentPage * currentPageSize;
  return {
    items: rows,
    hasMore: fetched < total,
    total,
  };
}

function filterProvidersByKind(
  items: VoucherProviderOption[],
  kind: VoucherPartnerKindUi,
): VoucherProviderOption[] {
  if (kind === VoucherPartnerKindUi.PARTNER) {
    return items.filter(
      (p) => providerUiKindFromCode(p.code) === VoucherPartnerKindUi.PARTNER,
    );
  }
  if (kind === VoucherPartnerKindUi.SUPPLIER) {
    return items.filter(
      (p) => providerUiKindFromCode(p.code) === VoucherPartnerKindUi.SUPPLIER,
    );
  }
  return items;
}

function buildListParams(
  query: string,
  page: number,
  pageSize: number,
  extra?: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...extra,
  });
  const q = query.trim();
  if (q) params.set("search", q);
  return params;
}

export async function searchVoucherCustomers(
  query: string,
  page: number,
  pageSize = 8,
): Promise<LookupSearchResult<VoucherCustomerOption>> {
  const { data } = await apiClient.get<Paginated<VoucherCustomerOption>>(
    `/customers?${buildListParams(query, page, pageSize)}`,
  );
  return paginate(data, page, pageSize);
}

export async function searchVoucherProviders(
  kind: VoucherPartnerKindUi,
  query: string,
  page: number,
  pageSize = 8,
): Promise<LookupSearchResult<VoucherProviderOption>> {
  const { data } = await apiClient.get<Paginated<VoucherProviderOption>>(
    `/inventory/providers?${buildListParams(query, page, pageSize)}`,
  );
  const filtered = filterProvidersByKind(data.data, kind);
  const hasMore = data.page * data.pageSize < data.total;
  return {
    items: filtered,
    hasMore,
    total: data.total,
  };
}

export async function searchVoucherStaff(
  query: string,
  page: number,
  pageSize = 8,
): Promise<LookupSearchResult<VoucherStaffOption>> {
  const { data } = await apiClient.get<Paginated<UserListItem>>(
    `/admin/users?${buildListParams(query, page, pageSize, { isActive: "true" })}`,
  );
  const items: VoucherStaffOption[] = data.data.map((u) => ({
    id: u.id,
    code: u.code ?? u.profile?.code ?? "",
    name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
    phone: u.profile?.mobile ?? undefined,
  }));
  return {
    items,
    hasMore: data.page * data.pageSize < data.total,
    total: data.total,
  };
}

export async function fetchVoucherCustomerById(
  id: string,
): Promise<VoucherCustomerOption | null> {
  try {
    const { data } = await apiClient.get<VoucherCustomerOption>(
      `/customers/${id}`,
    );
    return data;
  } catch {
    return null;
  }
}

export async function fetchVoucherProviderById(
  id: string,
): Promise<VoucherProviderOption | null> {
  try {
    const { data } = await apiClient.get<VoucherProviderOption>(
      `/inventory/providers/${id}`,
    );
    return data;
  } catch {
    return null;
  }
}

export async function fetchVoucherStaffById(
  id: string,
): Promise<VoucherStaffOption | null> {
  try {
    const { data } = await apiClient.get<UserListItem>(`/admin/users/${id}`);
    return {
      id: data.id,
      code: data.code ?? data.profile?.code ?? "",
      name: `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() || data.email,
      phone: data.profile?.mobile ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function fetchVoucherPartnerByBeType(
  partnerType: CashVoucherPartnerType | undefined,
  partnerId: string | undefined,
): Promise<{
  code: string;
  name: string;
  phone?: string;
  address?: string;
  kind: VoucherPartnerKindUi;
} | null> {
  if (!partnerType || !partnerId) return null;
  if (partnerType === CashVoucherPartnerType.CUSTOMER) {
    const c = await fetchVoucherCustomerById(partnerId);
    if (!c) return null;
    return {
      code: c.code,
      name: c.name,
      phone: c.phone,
      address: c.address,
      kind: VoucherPartnerKindUi.CUSTOMER,
    };
  }
  if (partnerType === CashVoucherPartnerType.EMPLOYEE) {
    const u = await fetchVoucherStaffById(partnerId);
    if (!u) return null;
    return {
      code: u.code,
      name: u.name,
      phone: u.phone,
      kind: VoucherPartnerKindUi.EMPLOYEE,
    };
  }
  if (partnerType === CashVoucherPartnerType.SUPPLIER) {
    const p = await fetchVoucherProviderById(partnerId);
    if (!p) return null;
    const kind = providerUiKindFromCode(p.code);
    return { code: p.code, name: p.name, phone: p.phone, kind };
  }
  return null;
}
