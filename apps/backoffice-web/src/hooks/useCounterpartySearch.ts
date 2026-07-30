import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "../lib/api-axios";

/**
 * Unified "đối tượng" lookup over suppliers, customers and employees, backed by
 * the CQRS endpoint `POST /v2/counterparties/search`. Mirrors the backend
 * `CounterpartyKind` / `CounterpartyOptionDto` contract.
 */
export type CounterpartyKind = "supplier" | "customer" | "employee";
export type CounterpartySearchType = CounterpartyKind | "all";
/** A single kind, "all", or an explicit subset of kinds searched together. */
export type CounterpartySearchScope =
  | CounterpartySearchType
  | CounterpartyKind[];

export interface CounterpartyOption {
  kind: CounterpartyKind;
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  address: string | null;
}

export interface CounterpartySearchResult {
  data: CounterpartyOption[];
  total: number;
  page: number;
  pageSize: number;
}

export const COUNTERPARTY_KIND_LABEL: Record<CounterpartyKind, string> = {
  supplier: "Nhà cung cấp",
  customer: "Khách hàng",
  employee: "Nhân viên",
};

/** Stable row key — an id may repeat across kinds, so qualify it by kind. */
export function counterpartyKey(c: { kind: string; id: string }): string {
  return `${c.kind}:${c.id}`;
}

const SEARCH_STALE_TIME = 30_000;

/**
 * Normalize the scope of a picker restricted to `allowedTypes` into the argument
 * the search function takes. A multi-kind subset is sent to the API as `types`
 * so the server merges those kinds — filtering an "all" page client-side would
 * drop every row whenever the first page is filled by a disallowed kind.
 */
export function counterpartySearchScope(
  allowedTypes?: CounterpartySearchType[],
): CounterpartySearchScope {
  if (!allowedTypes?.length || allowedTypes.includes("all")) return "all";
  return allowedTypes.filter((t): t is CounterpartyKind => t !== "all");
}

export function counterpartySearchKey(
  scope: CounterpartySearchScope,
  search: string,
  page: number,
  pageSize: number,
) {
  const scopeKey = Array.isArray(scope) ? scope.join("+") : scope;
  return ["counterparties-search", scopeKey, search, page, pageSize] as const;
}

async function fetchCounterparties(params: {
  scope: CounterpartySearchScope;
  search: string;
  page: number;
  pageSize: number;
}): Promise<CounterpartySearchResult> {
  const body: Record<string, unknown> = {
    page: params.page,
    pageSize: params.pageSize,
  };
  if (Array.isArray(params.scope)) body.types = params.scope;
  else body.type = params.scope;
  const q = params.search.trim();
  if (q) body.search = q;
  const { data } = await apiClient.post<CounterpartySearchResult>(
    "/v2/counterparties/search",
    body,
  );
  return data;
}

/**
 * Returns a cached imperative search function. Shared by both the inline
 * `CounterpartyPickerField` dropdown and the `CounterpartyPickerModal`.
 */
export function useCounterpartySearch() {
  const qc = useQueryClient();
  return useCallback(
    (
      scope: CounterpartySearchScope,
      search: string,
      page: number,
      pageSize: number,
    ) =>
      qc.fetchQuery({
        queryKey: counterpartySearchKey(scope, search.trim(), page, pageSize),
        queryFn: () => fetchCounterparties({ scope, search, page, pageSize }),
        staleTime: SEARCH_STALE_TIME,
      }),
    [qc],
  );
}
