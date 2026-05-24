import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { CUSTOMER_GROUP_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { customerGroupService } from "@erp/pos/services/customer-group.service";
import type { CustomerGroupRow } from "@erp/pos/interfaces/customer-group.interface";
import type { CreateCustomerGroupBody } from "@erp/pos/dtos/customer-group.dto";

/**
 * Fetches the full list of customer groups for the current organization
 * via `GET /customers/groups`. Used to populate the "Nhóm khách hàng"
 * select in customer dialogs and to resolve `groupId → name` elsewhere.
 */
export function useCustomerGroups(): UseQueryResult<CustomerGroupRow[], Error> {
  return useQuery<CustomerGroupRow[], Error>({
    queryKey: CUSTOMER_GROUP_KEYS.ALL,
    queryFn: customerGroupService.list,
    staleTime: 30_000,
  });
}

/**
 * `POST /customers/groups` — creates a new customer group. On success, busts
 * `CUSTOMER_GROUP_KEYS.ALL` so every consumer (group dropdowns, group-name
 * resolution on the customer-detail tab, …) refetches automatically.
 */
export function useCreateCustomerGroup(): UseMutationResult<
  CustomerGroupRow,
  Error,
  CreateCustomerGroupBody
> {
  const qc = useQueryClient();
  return useMutation<CustomerGroupRow, Error, CreateCustomerGroupBody>({
    mutationFn: (body) => customerGroupService.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CUSTOMER_GROUP_KEYS.ALL });
    },
  });
}
