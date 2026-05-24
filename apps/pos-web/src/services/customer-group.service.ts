import { http } from "@erp/pos/lib/common/http";
import type { CustomerGroupRow } from "@erp/pos/interfaces/customer-group.interface";
import type { CreateCustomerGroupBody } from "@erp/pos/dtos/customer-group.dto";

export const customerGroupService = {
  list: (): Promise<CustomerGroupRow[]> =>
    http.get<CustomerGroupRow[]>("/customers/groups"),

  create: (body: CreateCustomerGroupBody): Promise<CustomerGroupRow> =>
    http.post<CustomerGroupRow>("/customers/groups", body),
};
