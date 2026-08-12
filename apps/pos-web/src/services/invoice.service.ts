import { http } from "@erp/pos/lib/common/http";
import type {
  CancelInvoiceBody,
  CheckoutInvoiceBody,
  CheckoutReturnBody,
  CheckoutV2Body,
  CheckoutV2Response,
  CreateExchangeInvoiceBody,
  CreateInvoiceBody,
  CreateReturnInvoiceBody,
  InvoiceSearchV2Response,
  ListInvoicesParams,
  RedeemInvoicePointsBody,
  SearchDraftInvoicesBody,
  SearchInvoicesV2Body,
  SearchPurchaseHistoryBody,
  SearchReturnableInvoicesBody,
  UpdateInvoiceBody,
} from "@erp/pos/dtos/invoice.dto";
import type { InvoiceRow } from "@erp/pos/interfaces/invoice.interface";
import type { EligibleReturnLine } from "@erp/pos/interfaces/return-goods.interface";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";
import type { CustomerDebtRow } from "@erp/pos/interfaces/debt.interface";

export const invoiceService = {
  searchV2: (body: SearchInvoicesV2Body): Promise<InvoiceSearchV2Response> =>
    http.post<InvoiceSearchV2Response>("/v2/invoices/search", body),

  /** `POST /v2/invoices/returnable/search` — paid sales for the return page (#5). */
  searchReturnable: (
    body: SearchReturnableInvoicesBody,
  ): Promise<InvoiceSearchV2Response> =>
    http.post<InvoiceSearchV2Response>("/v2/invoices/returnable/search", body),

  /** `POST /v2/invoices/purchase-history/search` — one customer's history (#2). */
  searchPurchaseHistory: (
    body: SearchPurchaseHistoryBody,
  ): Promise<InvoiceSearchV2Response> =>
    http.post<InvoiceSearchV2Response>(
      "/v2/invoices/purchase-history/search",
      body,
    ),

  /** `GET /invoices/customers/:customerId/debts` — sổ công nợ của một khách (#3). */
  getCustomerDebts: (customerId: string): Promise<CustomerDebtRow[]> =>
    http.get<CustomerDebtRow[]>(
      `/invoices/customers/${encodeURIComponent(customerId)}/debts`,
    ),

  /** `POST /v2/invoices/drafts/search` — held draft invoices (#4). */
  searchDrafts: (
    body: SearchDraftInvoicesBody,
  ): Promise<InvoiceSearchV2Response> =>
    http.post<InvoiceSearchV2Response>("/v2/invoices/drafts/search", body),

  create: (body: CreateInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>("/invoices", body),

  getById: (id: string): Promise<InvoiceRow> =>
    http.get<InvoiceRow>(`/invoices/${encodeURIComponent(id)}`),

  update: (id: string, body: UpdateInvoiceBody): Promise<InvoiceRow> =>
    http.patch<InvoiceRow>(`/invoices/${encodeURIComponent(id)}`, body),

  list: (params: ListInvoicesParams = {}): Promise<Paginated<InvoiceRow>> => {
    const qs = new URLSearchParams();
    if (params.customerId) qs.set("customerId", params.customerId);
    if (params.status) qs.set("status", params.status);
    if (params.isDraft !== undefined) qs.set("isDraft", String(params.isDraft));
    if (params.branchId) qs.set("branchId", params.branchId);
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<Paginated<InvoiceRow>>(`/invoices${suffix}`);
  },

  /**
   * `VITE_CHECKOUT_V2=true` → `POST /v2/pos/checkout` (saga mới, T-05-01..04);
   * mặc định → `POST /invoices/:id/checkout` (luồng cũ). Chữ ký hàm không đổi
   * nên `use-query-invoice.ts` (chỗ gọi duy nhất, A-08) không phải sửa gì —
   * đó là toàn bộ lý do cờ nằm ở tầng service chứ không ở tầng hook.
   *
   * `/v2/pos/checkout` không trả `InvoiceRow` đầy đủ, chỉ tổng kết saga
   * (`CheckoutV2Response`) — gọi lại `getById` sau khi commit để trả đúng
   * hình dạng phần còn lại của app đang mong đợi, giống hệt luồng cũ.
   *
   * `body.selectedProgramIds` chỉ đi vào request khi cờ v2 bật — nhánh v1
   * build payload riêng, không spread `body`, nên field này không lọt qua.
   */
  checkout: async (id: string, body: CheckoutInvoiceBody): Promise<InvoiceRow> => {
    if (import.meta.env.VITE_CHECKOUT_V2 === "true") {
      const v2Body: CheckoutV2Body = {
        invoiceId: id,
        payments: body.payments,
        keptChangeAmount: body.keptChangeAmount,
        dueDate: body.dueDate,
        creditDays: body.creditDays,
        ...(body.selectedProgramIds?.length
          ? { selectedProgramIds: body.selectedProgramIds }
          : {}),
        ...(body.excludedProgramIds?.length
          ? { excludedProgramIds: body.excludedProgramIds }
          : {}),
      };
      await http.post<CheckoutV2Response>("/v2/pos/checkout", v2Body);
      return http.get<InvoiceRow>(`/invoices/${encodeURIComponent(id)}`);
    }
    // Nhánh v1 không khai báo `selectedProgramIds` — build payload tách riêng
    // thay vì spread nguyên `body`, để field mới (nếu caller lỡ truyền) không
    // lọt qua và bị `forbidNonWhitelisted` của ValidationPipe từ chối 400.
    return http.post<InvoiceRow>(`/invoices/${encodeURIComponent(id)}/checkout`, {
      payments: body.payments,
      keptChangeAmount: body.keptChangeAmount,
      dueDate: body.dueDate,
      creditDays: body.creditDays,
    });
  },

  delete: (id: string): Promise<void> =>
    http.delete<void>(`/invoices/${encodeURIComponent(id)}`),

  /**
   * `POST /invoices/:id/cancel` — huỷ hoá đơn đã thanh toán. Backend hoàn tiền
   * về đúng quỹ đã thu và cộng hàng lại kho showroom.
   */
  cancel: (id: string, body: CancelInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>(`/invoices/${encodeURIComponent(id)}/cancel`, body),

  // ─── Return / Exchange (EPIC-011) ─────────────────────────────────────────

  /** `GET /invoices/:id/eligible-returns` — dòng hàng còn được phép trả. */
  getEligibleReturns: (id: string): Promise<EligibleReturnLine[]> =>
    http.get<EligibleReturnLine[]>(
      `/invoices/${encodeURIComponent(id)}/eligible-returns`,
    ),

  /** `POST /invoices/returns` — tạo draft RETURN (mode quick|regular). */
  createReturn: (body: CreateReturnInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>("/invoices/returns", body),

  /** `POST /invoices/exchanges` — tạo draft EXCHANGE. */
  createExchange: (body: CreateExchangeInvoiceBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>("/invoices/exchanges", body),

  /** `POST /invoices/:id/checkout-return` — tất toán đơn trả/đổi. */
  checkoutReturn: (id: string, body: CheckoutReturnBody): Promise<InvoiceRow> =>
    http.post<InvoiceRow>(
      `/invoices/${encodeURIComponent(id)}/checkout-return`,
      body,
    ),

  /**
   * `POST /invoices/:id/redeem-points` — áp dụng đổi điểm vào draft. BE ghi
   * `pointsRedeemed`, `pointsDiscountAmount` (=points × 1.000), tính lại
   * `amountDue`. Điểm thực sự bị trừ trên thẻ ở bước `checkout` (transaction).
   */
  redeemPoints: (
    id: string,
    body: RedeemInvoicePointsBody,
  ): Promise<InvoiceRow> =>
    http.post<InvoiceRow>(
      `/invoices/${encodeURIComponent(id)}/redeem-points`,
      body,
    ),

  /** `DELETE /invoices/:id/redeem-points` — gỡ đổi điểm khỏi draft. */
  clearRedeemPoints: (id: string): Promise<InvoiceRow> =>
    http.delete<InvoiceRow>(
      `/invoices/${encodeURIComponent(id)}/redeem-points`,
    ),
};
