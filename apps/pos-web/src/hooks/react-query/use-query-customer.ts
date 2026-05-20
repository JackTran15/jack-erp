import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { CUSTOMER_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { customerService } from "@erp/pos/services/customer.service";
import type { CustomerDetail, CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type {
  CreateCustomerBody,
  UpdateCustomerBody,
} from "@erp/pos/dtos/customer.dto";

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
