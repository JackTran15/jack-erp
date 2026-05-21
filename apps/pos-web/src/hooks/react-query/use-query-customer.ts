import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { CUSTOMER_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { customerService } from "@erp/pos/services/customer.service";
import { invoiceService } from "@erp/pos/services/invoice.service";
import type { CustomerDetail, CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";
import type {
  CreateCustomerBody,
  PaginatedCustomers,
  UpdateCustomerBody,
} from "@erp/pos/dtos/customer.dto";

export interface UseCustomerSearchResult {
  /**
   * Tìm khách theo từ khoá — `GET /customers?search=`. Dùng cho typeahead
   * imperative (search adapter của popover + submit Enter). `fetchQuery` cache
   * theo `CUSTOMER_KEYS.SEARCH(query)` nên gõ lại cùng từ khoá không gọi lại API.
   */
  search: (query: string) => Promise<PaginatedCustomers>;
}

export function useCustomerSearch(): UseCustomerSearchResult {
  const qc = useQueryClient();
  const search = useCallback(
    (query: string) =>
      qc.fetchQuery({
        queryKey: CUSTOMER_KEYS.SEARCH(query.trim()),
        queryFn: () => customerService.search(query),
        staleTime: 30_000,
      }),
    [qc],
  );
  return { search };
}

/**
 * Fetches the full customer record via `GET /customers/:id`.
 *
 * Pass `undefined` (or an empty id) to keep the query disabled — useful when
 * the dialog isn't open yet but the hook is mounted higher in the tree.
 */
export function useCustomer(
  id: string | undefined,
): UseQueryResult<CustomerDetail, Error> {
  return useQuery<CustomerDetail, Error>({
    queryKey: CUSTOMER_KEYS.DETAIL(id ?? ""),
    queryFn: () => customerService.get(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/**
 * Lịch sử mua hàng của khách — `GET /invoices?customerId=...&isDraft=false`.
 *
 * Dùng endpoint invoice đã có (TKT-039); endpoint chuyên biệt
 * `GET /customers/:id/invoices` (TKT-044) chưa được backend implement. Danh
 * sách bị scope theo chi nhánh hiện tại qua header `X-Branch-Id`.
 *
 * Truyền `undefined` để tắt query (vd khi dialog chưa mở hoặc chưa ở tab này).
 */
export function useCustomerPurchaseHistory(
  customerId: string | undefined,
): UseQueryResult<Paginated<InvoiceRow>, Error> {
  return useQuery<Paginated<InvoiceRow>, Error>({
    queryKey: CUSTOMER_KEYS.PURCHASE_HISTORY(customerId ?? ""),
    queryFn: () =>
      invoiceService.list({
        customerId,
        isDraft: false,
        page: 1,
        limit: 100,
      }),
    enabled: Boolean(customerId),
    staleTime: 30_000,
  });
}

/**
 * `POST /customers` — creates a new customer record. Cache invalidation is
 * intentionally omitted: there's no canonical list query to bust, and the
 * caller usually navigates the new row in via `pickCustomer` directly.
 */
export function useCreateCustomer(): UseMutationResult<
  CustomerRow,
  Error,
  CreateCustomerBody
> {
  return useMutation<CustomerRow, Error, CreateCustomerBody>({
    mutationFn: (body) => customerService.create(body),
  });
}

interface UpdateCustomerVars {
  id: string;
  body: UpdateCustomerBody;
}

/**
 * `PATCH /customers/:id` — updates a customer record. On success, busts the
 * per-customer cache so the detail dialog re-reads fresh data on next open.
 */
export function useUpdateCustomer(): UseMutationResult<
  CustomerRow,
  Error,
  UpdateCustomerVars
> {
  const qc = useQueryClient();
  return useMutation<CustomerRow, Error, UpdateCustomerVars>({
    mutationFn: ({ id, body }) => customerService.update(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.DETAIL(id) });
    },
  });
}
