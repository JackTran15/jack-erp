import { http } from "@erp/pos/lib/common/http";
import type {
  CustomerDetail,
  CustomerRow,
} from "@erp/pos/interfaces/customer.interface";
import type {
  CreateCustomerBody,
  PaginatedCustomers,
  UpdateCustomerBody,
} from "@erp/pos/dtos/customer.dto";

export const customerService = {
  search: (search: string): Promise<PaginatedCustomers> => {
    const params = new URLSearchParams({
      page: "1",
      pageSize: "25",
      search: search.trim(),
    });
    return http.get<PaginatedCustomers>(`/customers?${params.toString()}`);
  },

  create: (body: CreateCustomerBody): Promise<CustomerRow> =>
    http.post<CustomerRow>("/customers", body),

  get: (id: string): Promise<CustomerDetail> =>
    http.get<CustomerDetail>(`/customers/${encodeURIComponent(id)}`),

  update: (id: string, body: UpdateCustomerBody): Promise<CustomerRow> =>
    http.patch<CustomerRow>(`/customers/${encodeURIComponent(id)}`, body),
};
