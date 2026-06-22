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

export function counterpartySearchKey(
  type: CounterpartySearchType,
  search: string,
  page: number,
  pageSize: number,
) {
  return ["counterparties-search", type, search, page, pageSize] as const;
}

async function fetchCounterparties(params: {
  type: CounterpartySearchType;
  search: string;
  page: number;
  pageSize: number;
}): Promise<CounterpartySearchResult> {
  const body: Record<string, unknown> = {
    type: params.type,
    page: params.page,
    pageSize: params.pageSize,
  };
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
      type: CounterpartySearchType,
      search: string,
      page: number,
      pageSize: number,
    ) =>
      qc.fetchQuery({
        queryKey: counterpartySearchKey(type, search.trim(), page, pageSize),
        queryFn: () => fetchCounterparties({ type, search, page, pageSize }),
        staleTime: SEARCH_STALE_TIME,
      }),
    [qc],
  );
}
