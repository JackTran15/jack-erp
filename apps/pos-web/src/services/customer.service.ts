import { http } from "@erp/pos/lib/common/http";
import type {
  CustomerDetail,
  CustomerRow,
} from "@erp/pos/interfaces/customer.interface";
import type { CustomerSummary } from "@erp/pos/interfaces/customer-summary.interface";
import type { MembershipCard } from "@erp/pos/interfaces/membership-card.interface";
import type { MembershipCardType } from "@erp/pos/interfaces/membership-card-type.interface";
import type {
  CreateCustomerBody,
  IssueMembershipCardBody,
  ListCustomersParams,
  PaginatedCustomers,
  UpdateCustomerBody,
  UpdateMembershipCardBody,
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

  list: (params: ListCustomersParams = {}): Promise<PaginatedCustomers> => {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      pageSize: String(params.pageSize ?? 50),
    });
    return http.get<PaginatedCustomers>(`/customers?${qs.toString()}`);
  },

  create: (body: CreateCustomerBody): Promise<CustomerRow> =>
    http.post<CustomerRow>("/customers", body),

  get: (id: string): Promise<CustomerDetail> =>
    http.get<CustomerDetail>(`/customers/${encodeURIComponent(id)}`),

  update: (id: string, body: UpdateCustomerBody): Promise<CustomerRow> =>
    http.patch<CustomerRow>(`/customers/${encodeURIComponent(id)}`, body),

  /**
   * `GET /customers/:id/summary` — tổng hợp tổng chi tiêu / công nợ / thẻ
   * thành viên. Membership = null khi khách chưa có thẻ active.
   */
  getSummary: (id: string): Promise<CustomerSummary> =>
    http.get<CustomerSummary>(
      `/customers/${encodeURIComponent(id)}/summary`,
    ),

  /**
   * `GET /customers/:id/membership-card`. BE ném 404 khi khách chưa có thẻ
   * (xem `MembershipCardService.getByCustomer`) → map về `null` để UI hiển
   * thị empty state thay vì throw lan ra component.
   */
  getMembershipCard: (id: string): Promise<MembershipCard | null> =>
    http
      .get<MembershipCard>(
        `/customers/${encodeURIComponent(id)}/membership-card`,
      )
      .catch((err) => {
        if (err instanceof Error && err.message.startsWith("HTTP 404")) {
          return null;
        }
        throw err;
      }),

  /** `GET /customers/membership-card-types` — danh sách loại thẻ active trong org. */
  getMembershipCardTypes: (): Promise<MembershipCardType[]> =>
    http.get<MembershipCardType[]>("/customers/membership-card-types"),

  /** `POST /customers/:id/membership-card` — cấp thẻ thành viên mới cho khách. */
  issueMembershipCard: (
    customerId: string,
    body: IssueMembershipCardBody,
  ): Promise<MembershipCard> =>
    http.post<MembershipCard>(
      `/customers/${encodeURIComponent(customerId)}/membership-card`,
      body,
    ),

  /** `PATCH /customers/:id/membership-card` — cập nhật hạng thẻ hiện tại. */
  updateMembershipCard: (
    customerId: string,
    body: UpdateMembershipCardBody,
  ): Promise<MembershipCard> =>
    http.patch<MembershipCard>(
      `/customers/${encodeURIComponent(customerId)}/membership-card`,
      body,
    ),
};
