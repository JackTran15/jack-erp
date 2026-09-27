import { http } from "@erp/pos/lib/common/http";
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

/**
 * Đơn hàng online / giao hàng của chi nhánh đang active. `http` tự gắn
 * `X-Branch-Id`; mọi endpoint ở đây là `@RequireBranchScope()`.
 */
export const salesOrderService = {
  /** `GET /mobile/sales-channels` — kênh active của tổ chức (sidebar). */
  listSalesChannels: (): Promise<SalesChannelRow[]> =>
    http.get<SalesChannelRow[]>("/mobile/sales-channels"),

  /** `GET /mobile/delivery-partners` — đối tác giao hàng active của tổ chức. */
  listDeliveryPartners: (): Promise<DeliveryPartnerRow[]> =>
    http.get<DeliveryPartnerRow[]>("/mobile/delivery-partners"),

  /** `POST /v2/mobile/sales-orders/search` — lưới đơn, lọc + phân trang server-side. */
  searchSalesOrders: (
    body: SearchSalesOrdersBody,
  ): Promise<SearchSalesOrdersResponse> =>
    http.post<SearchSalesOrdersResponse>("/v2/mobile/sales-orders/search", body),

  /** `POST /mobile/sales-orders/process` — *Nhận xử lý* nhiều đơn, mỗi đơn độc lập. */
  processSalesOrders: (
    body: ProcessSalesOrdersBody,
  ): Promise<ProcessSalesOrdersResponse> =>
    http.post<ProcessSalesOrdersResponse>("/mobile/sales-orders/process", body),

  /** `POST /mobile/sales-orders/deliver` — *Giao hàng* nhiều đơn với một bộ thông tin giao. */
  deliverSalesOrders: (
    body: DeliverSalesOrdersBody,
  ): Promise<SalesOrderBatchResponse> =>
    http.post<SalesOrderBatchResponse>("/mobile/sales-orders/deliver", body),

  /** `POST /mobile/sales-orders/delivery-status` — *Cập nhật TT* / *Hoàn thành* nhiều đơn. */
  updateDeliveryStatus: (
    body: UpdateDeliveryStatusBody,
  ): Promise<SalesOrderBatchResponse> =>
    http.post<SalesOrderBatchResponse>(
      "/mobile/sales-orders/delivery-status",
      body,
    ),
};
