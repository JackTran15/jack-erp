import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  type CreateCustomerBody,
  type CustomerDetail,
  type CustomerRow,
  type UpdateCustomerBody,
} from "@erp/pos/lib/common/customerApi";

/**
 * Shared TanStack Query key factory for a single customer record. Exported so
 * mutations (e.g. `PATCH /customers/:id`) can target the exact entry to
 * invalidate without duplicating the key shape.
 */
export const customerQueryKey = (id: string) => ["customers", id] as const;

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
    queryKey: customerQueryKey(id ?? ""),
    queryFn: () => getCustomer(id as string),
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
    mutationFn: (body) => createCustomer(body),
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
    mutationFn: ({ id, body }) => updateCustomer(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: customerQueryKey(id) });
    },
  });
}
