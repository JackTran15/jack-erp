import { useCallback, useMemo } from "react";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { CUSTOMER_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { customerService } from "@erp/pos/services/customer.service";
import { invoiceService } from "@erp/pos/services/invoice.service";
import type { CustomerDetail, CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { CustomerSummary } from "@erp/pos/interfaces/customer-summary.interface";
import type { MembershipCard } from "@erp/pos/interfaces/membership-card.interface";
import type { MembershipCardType } from "@erp/pos/interfaces/membership-card-type.interface";
import type {
  InvoiceSearchV2Response,
  SearchPurchaseHistoryBody,
} from "@erp/pos/dtos/invoice.dto";
import type {
  CreateCustomerBody,
  IssueMembershipCardBody,
  ListCustomersParams,
  PaginatedCustomers,
  UpdateCustomerBody,
  UpdateMembershipCardBody,
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
 * Prefetch danh sách khách — `GET /customers?page=&pageSize=`. Dùng cho customer
 * picker: nạp sẵn một trang khách khi mount để hiển thị/lọc local ngay khi click,
 * chỉ fallback `useCustomerSearch` khi từ khoá không khớp danh sách prefetch.
 */
export function useCustomerListQuery(
  params: ListCustomersParams = {},
): UseQueryResult<PaginatedCustomers, Error> {
  return useQuery<PaginatedCustomers, Error>({
    queryKey: CUSTOMER_KEYS.LIST(params),
    queryFn: () => customerService.list(params),
    staleTime: 5 * 60_000,
  });
}

/**
 * Resolve nhiều khách theo `customerId` (mỗi id 1 `GET /customers/:id`, cache
 * chung `CUSTOMER_KEYS.DETAIL`). Trả `Map<id, CustomerDetail>` cho các id đã có
 * dữ liệu — dùng để hiển thị tên/SĐT khách trong danh sách hoá đơn lưu tạm.
 */
export function useCustomersByIds(
  ids: string[],
): Map<string, CustomerDetail> {
  const uniqueIds = useMemo(
    () => Array.from(new Set(ids.filter(Boolean))),
    [ids],
  );

  const results = useQueries({
    queries: uniqueIds.map((id) => ({
      queryKey: CUSTOMER_KEYS.DETAIL(id),
      queryFn: () => customerService.get(id),
      enabled: Boolean(id),
      staleTime: 30_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, CustomerDetail>();
    results.forEach((result, index) => {
      const id = uniqueIds[index];
      if (id && result.data) map.set(id, result.data);
    });
    return map;
  }, [results, uniqueIds]);
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
 * Lịch sử mua hàng của khách — `POST /v2/invoices/purchase-history/search`,
 * server-side filter + pagination. Org-wide cho 1 `customerId` (lịch sử trải
 * nhiều cửa hàng); BE trả `branch` inline cho cột "Tên cửa hàng".
 *
 * Truyền `customerId = undefined` (hoặc `enabled = false`) để tắt query khi
 * dialog chưa mở / chưa ở tab này.
 */
export function useCustomerPurchaseHistory(
  customerId: string | undefined,
  body: Omit<SearchPurchaseHistoryBody, "customerId">,
  enabled = true,
): UseQueryResult<InvoiceSearchV2Response, Error> {
  return useQuery<InvoiceSearchV2Response, Error>({
    queryKey: CUSTOMER_KEYS.PURCHASE_HISTORY(
      customerId ?? "",
      body as Record<string, unknown>,
    ),
    queryFn: () =>
      invoiceService.searchPurchaseHistory({
        ...body,
        customerId: customerId as string,
      }),
    enabled: Boolean(customerId) && enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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

/**
 * Tổng chi tiêu / công nợ / thẻ thành viên — `GET /customers/:id/summary`.
 * Dùng cho tab "Tổng quan" của `CustomerDetailDialog` và panel member trong
 * `DiscountPointDialog`. Truyền `undefined` để tắt query khi dialog chưa mở.
 */
export function useCustomerSummary(
  id: string | undefined,
): UseQueryResult<CustomerSummary, Error> {
  return useQuery<CustomerSummary, Error>({
    queryKey: CUSTOMER_KEYS.SUMMARY(id ?? ""),
    queryFn: () => customerService.getSummary(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/**
 * Chi tiết thẻ thành viên — `GET /customers/:id/membership-card`. Trả về `null`
 * khi khách chưa có thẻ (service đã map từ 404). Hữu ích khi cần `expiresAt` /
 * `isActive` mà `summary.membership` không có.
 */
export function useMembershipCard(
  id: string | undefined,
): UseQueryResult<MembershipCard | null, Error> {
  return useQuery<MembershipCard | null, Error>({
    queryKey: CUSTOMER_KEYS.MEMBERSHIP_CARD(id ?? ""),
    queryFn: () => customerService.getMembershipCard(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

/**
 * Danh sách loại thẻ thành viên — `GET /customers/membership-card-types`.
 * Dùng cho dialog cấp thẻ để hiển thị danh sách chọn.
 */
export function useMembershipCardTypes(): UseQueryResult<MembershipCardType[], Error> {
  return useQuery<MembershipCardType[], Error>({
    queryKey: CUSTOMER_KEYS.MEMBERSHIP_CARD_TYPES,
    queryFn: () => customerService.getMembershipCardTypes(),
    staleTime: 5 * 60_000,
  });
}

interface IssueMembershipCardVars {
  customerId: string;
  body: IssueMembershipCardBody;
}

/**
 * `POST /customers/:id/membership-card` — cấp thẻ thành viên mới.
 * On success: invalidate summary + membership-card cache của khách đó.
 */
export function useIssueMembershipCard(): UseMutationResult<
  MembershipCard,
  Error,
  IssueMembershipCardVars
> {
  const qc = useQueryClient();
  return useMutation<MembershipCard, Error, IssueMembershipCardVars>({
    mutationFn: ({ customerId, body }) =>
      customerService.issueMembershipCard(customerId, body),
    onSuccess: (_data, { customerId }) => {
      void qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.SUMMARY(customerId) });
      void qc.invalidateQueries({
        queryKey: CUSTOMER_KEYS.MEMBERSHIP_CARD(customerId),
      });
    },
  });
}

interface UpdateMembershipCardVars {
  customerId: string;
  body: UpdateMembershipCardBody;
}

/**
 * `PATCH /customers/:id/membership-card` — đổi hạng thẻ hiện tại.
 * On success: invalidate summary + membership-card cache của khách đó.
 */
export function useUpdateMembershipCard(): UseMutationResult<
  MembershipCard,
  Error,
  UpdateMembershipCardVars
> {
  const qc = useQueryClient();
  return useMutation<MembershipCard, Error, UpdateMembershipCardVars>({
    mutationFn: ({ customerId, body }) =>
      customerService.updateMembershipCard(customerId, body),
    onSuccess: (_data, { customerId }) => {
      void qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.SUMMARY(customerId) });
      void qc.invalidateQueries({
        queryKey: CUSTOMER_KEYS.MEMBERSHIP_CARD(customerId),
      });
    },
  });
}
