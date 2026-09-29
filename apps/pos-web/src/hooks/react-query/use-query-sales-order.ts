import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  DELIVERY_PARTNER_KEYS,
  SALES_CHANNEL_KEYS,
  SALES_ORDER_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import { salesOrderService } from "@erp/pos/services/sales-order.service";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import type {
  DeliverSalesOrdersBody,
  ProcessSalesOrdersBody,
  ProcessSalesOrdersResponse,
  SalesOrderBatchResponse,
  SearchSalesOrdersBody,
  SearchSalesOrdersResponse,
  UpdateDeliveryStatusBody,
} from "@erp/pos/dtos/sales-order.dto";
import type {
  DeliveryPartnerRow,
  SalesChannelRow,
} from "@erp/pos/interfaces/sales-order.interface";

/** Kênh / đối tác là dữ liệu cấu hình cấp tổ chức, ít đổi trong ca. */
const LOOKUP_STALE_TIME_MS = 5 * 60_000;

/** `GET /mobile/sales-channels` — sidebar kênh của trang "Đơn hàng Online". */
export function useSalesChannelsQuery(): UseQueryResult<
  SalesChannelRow[],
  Error
> {
  return useQuery<SalesChannelRow[], Error>({
    queryKey: SALES_CHANNEL_KEYS.ALL,
    queryFn: () => salesOrderService.listSalesChannels(),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/** `GET /mobile/delivery-partners` — nguồn chọn đối tác giao hàng. */
export function useDeliveryPartnersQuery(): UseQueryResult<
  DeliveryPartnerRow[],
  Error
> {
  return useQuery<DeliveryPartnerRow[], Error>({
    queryKey: DELIVERY_PARTNER_KEYS.ALL,
    queryFn: () => salesOrderService.listDeliveryPartners(),
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

/**
 * `POST /v2/mobile/sales-orders/search` — lưới đơn theo kênh, lọc + phân trang
 * server-side. `branchId` nằm trong key (server lọc theo `X-Branch-Id`, không
 * theo body) để đổi chi nhánh không trả cache của chi nhánh cũ.
 * `placeholderData: keepPreviousData` giữ dữ liệu cũ trong khi load trang/filter mới.
 */
export function useSearchSalesOrdersQuery(
  body: SearchSalesOrdersBody,
  options: { enabled?: boolean } = {},
): UseQueryResult<SearchSalesOrdersResponse, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<SearchSalesOrdersResponse, Error>({
    queryKey: SALES_ORDER_KEYS.SEARCH(body.view, {
      ...body,
      branchId,
    } as Record<string, unknown>),
    queryFn: () => salesOrderService.searchSalesOrders(body),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * `POST /mobile/sales-orders/process` — *Nhận xử lý* nhiều đơn. Kết quả từng
 * đơn nằm trong `results`; lưới được làm mới dù thành công hay lỗi.
 */
export function useProcessSalesOrdersMutation(): UseMutationResult<
  ProcessSalesOrdersResponse,
  Error,
  ProcessSalesOrdersBody
> {
  const qc = useQueryClient();
  return useMutation<ProcessSalesOrdersResponse, Error, ProcessSalesOrdersBody>(
    {
      mutationFn: (body) => salesOrderService.processSalesOrders(body),
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: SALES_ORDER_KEYS.ALL });
      },
    },
  );
}

/**
 * `POST /mobile/sales-orders/deliver` — *Giao hàng* các đơn tick. Kết quả từng
 * đơn nằm trong `results`; lưới được làm mới dù thành công hay lỗi.
 */
export function useDeliverSalesOrdersMutation(): UseMutationResult<
  SalesOrderBatchResponse,
  Error,
  DeliverSalesOrdersBody
> {
  const qc = useQueryClient();
  return useMutation<SalesOrderBatchResponse, Error, DeliverSalesOrdersBody>({
    mutationFn: (body) => salesOrderService.deliverSalesOrders(body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SALES_ORDER_KEYS.ALL });
    },
  });
}

/**
 * `POST /mobile/sales-orders/delivery-status` — *Cập nhật TT* / *Hoàn thành*
 * các đơn tick. Lưới được làm mới dù thành công hay lỗi.
 */
export function useUpdateDeliveryStatusMutation(): UseMutationResult<
  SalesOrderBatchResponse,
  Error,
  UpdateDeliveryStatusBody
> {
  const qc = useQueryClient();
  return useMutation<SalesOrderBatchResponse, Error, UpdateDeliveryStatusBody>(
    {
      mutationFn: (body) => salesOrderService.updateDeliveryStatus(body),
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: SALES_ORDER_KEYS.ALL });
      },
    },
  );
}
