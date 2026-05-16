import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createCustomerGroup,
  listCustomerGroups,
  type CreateCustomerGroupBody,
  type CustomerGroupRow,
} from "@erp/pos/lib/common/customerApi";

/**
 * Shared TanStack Query key for the customer-group list. Exported so that
 * callers that mutate the list (e.g. `CustomerGroupCreateDialog`) can
 * invalidate the cache to trigger a refetch.
 */
export const CUSTOMER_GROUPS_QUERY_KEY = ["customer-groups"] as const;

/**
 * Fetches the full list of customer groups for the current organization
 * via `GET /customers/groups`. Used to populate the "Nhóm khách hàng"
 * select in customer dialogs and to resolve `groupId → name` elsewhere.
 */
export function useCustomerGroups(): UseQueryResult<CustomerGroupRow[], Error> {
  return useQuery<CustomerGroupRow[], Error>({
    queryKey: CUSTOMER_GROUPS_QUERY_KEY,
    queryFn: listCustomerGroups,
    staleTime: 30_000,
  });
}

/**
 * `POST /customers/groups` — creates a new customer group. On success, busts
 * `CUSTOMER_GROUPS_QUERY_KEY` so every consumer (group dropdowns, group-name
 * resolution on the customer-detail tab, …) refetches automatically.
 */
export function useCreateCustomerGroup(): UseMutationResult<
  CustomerGroupRow,
  Error,
  CreateCustomerGroupBody
> {
  const qc = useQueryClient();
  return useMutation<CustomerGroupRow, Error, CreateCustomerGroupBody>({
    mutationFn: (body) => createCustomerGroup(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CUSTOMER_GROUPS_QUERY_KEY });
    },
  });
}
