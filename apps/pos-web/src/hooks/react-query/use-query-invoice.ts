import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  CATALOG_KEYS,
  CUSTOMER_KEYS,
  INVOICE_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import { INVOICE_LIST_DEFAULT_PAGE_SIZE } from "@erp/pos/constants/invoice-list.constant";
import { invoiceService } from "@erp/pos/services/invoice.service";
import { customerService } from "@erp/pos/services/customer.service";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { mapInvoiceToReturnRow } from "@erp/pos/lib/page-libs/return-goods/returnInvoiceMapper";
import { mapInvoiceToListRow } from "@erp/pos/lib/page-libs/invoice-list/invoiceListMapper";
import type {
  CheckoutInvoiceBody,
  CheckoutReturnBody,
  CreateExchangeInvoiceBody,
  CreateInvoiceBody,
  CreateReturnInvoiceBody,
  SearchDraftInvoicesBody,
  SearchInvoicesV2Body,
  SearchReturnableInvoicesBody,
  UpdateInvoiceBody,
} from "@erp/pos/dtos/invoice.dto";
import type {
  InvoiceListRow,
  InvoiceRow,
} from "@erp/pos/interfaces/invoice.interface";
import type {
  EligibleReturnLine,
  ReturnInvoiceRow,
} from "@erp/pos/interfaces/return-goods.interface";

export function useCreateInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CreateInvoiceBody
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, CreateInvoiceBody>({
    mutationFn: (body) => invoiceService.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

interface UpdateInvoiceVars {
  id: string;
  body: UpdateInvoiceBody;
}

/**
 * `PATCH /invoices/:id` — cập nhật draft (thay items/customer/note). Dùng khi
 * tab được restore từ một draft: lưu/thanh toán lại sẽ ghi đè chính draft đó.
 */
export function useUpdateInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  UpdateInvoiceVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, UpdateInvoiceVars>({
    mutationFn: ({ id, body }) => invoiceService.update(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

interface CheckoutInvoiceVars {
  id: string;
  body: CheckoutInvoiceBody;
}

export function useCheckoutInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CheckoutInvoiceVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, CheckoutInvoiceVars>({
    mutationFn: ({ id, body }) => invoiceService.checkout(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.ALL });
      // Bán hàng trừ tồn — refetch catalog để snapshot tồn (`maxQty`) của lần
      // thêm sản phẩm kế tiếp phản ánh đúng tồn mới (icon cảnh báo vượt tồn).
      void qc.invalidateQueries({ queryKey: CATALOG_KEYS.ALL });
    },
  });
}

interface DeleteInvoiceContext {
  previousDrafts: Array<[readonly unknown[], InvoiceRow[] | undefined]>;
}

export function useDeleteInvoiceMutation(): UseMutationResult<
  void,
  Error,
  string,
  DeleteInvoiceContext
> {
  const qc = useQueryClient();
  return useMutation<void, Error, string, DeleteInvoiceContext>({
    mutationFn: (id) => invoiceService.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
      const previousDrafts = qc.getQueriesData<InvoiceRow[]>({
        queryKey: INVOICE_KEYS.DRAFTS_PREFIX,
      });
      qc.setQueriesData<InvoiceRow[]>(
        { queryKey: INVOICE_KEYS.DRAFTS_PREFIX },
        (old) => (old ? old.filter((row) => row.id !== id) : old),
      );
      return { previousDrafts };
    },
    onError: (_err, _id, context) => {
      if (!context) return;
      for (const [key, data] of context.previousDrafts) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DRAFTS_PREFIX });
    },
  });
}

/**
 * Chi tiết một hóa đơn — `GET /invoices/:id` (kèm `items[]` + thông tin thanh
 * toán). Truyền `undefined` để tắt query khi chưa cần.
 */
export function useInvoiceDetailQuery(
  id: string | undefined,
): UseQueryResult<InvoiceRow, Error> {
  return useQuery<InvoiceRow, Error>({
    queryKey: INVOICE_KEYS.DETAIL(id ?? ""),
    queryFn: () => invoiceService.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

interface UseDraftInvoicesQueryInput {
  body: SearchDraftInvoicesBody;
  /**
   * Chỉ dùng để tách cache theo terminal; KHÔNG gửi làm filter — giữ nguyên
   * hành vi hiện tại (liệt kê mọi draft của org/chi nhánh, không scope session).
   */
  sessionId: string;
  enabled?: boolean;
}

/**
 * Hóa đơn lưu tạm (#4) — server-side free-text + date-range search qua
 * `POST /v2/invoices/drafts/search`. Trả thẳng `InvoiceRow[]` (kèm `customer`
 * inline) để giữ nguyên mapping của `DraftInvoicesDialog` + optimistic update
 * của `useDeleteInvoiceMutation` (cùng prefix `INVOICE_KEYS.DRAFTS_PREFIX`).
 */
export function useDraftInvoicesQuery(
  input: UseDraftInvoicesQueryInput,
): UseQueryResult<InvoiceRow[], Error> {
  return useQuery<InvoiceRow[], Error>({
    queryKey: INVOICE_KEYS.DRAFTS_SEARCH({
      ...input.body,
      sessionId: input.sessionId,
    } as Record<string, unknown>),
    queryFn: async () => (await invoiceService.searchDrafts(input.body)).data,
    enabled: Boolean(input.sessionId) && (input.enabled ?? true),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

// ─── Return / Exchange (EPIC-011) ───────────────────────────────────────────

/**
 * Hóa đơn bán đã thanh toán (type=SALE, status=PAID) cho trang đổi trả (#5) —
 * server-side filter + pagination qua `POST /v2/invoices/returnable/search`.
 * Customer + branch được BE trả inline (join), không còn enrich N+1 nữa.
 * BE đã lọc type/status nên client không cần loại RETURN/EXCHANGE.
 */
export function useReturnableInvoicesQuery(
  body: SearchReturnableInvoicesBody,
): UseQueryResult<{ rows: ReturnInvoiceRow[]; total: number }, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<{ rows: ReturnInvoiceRow[]; total: number }, Error>({
    queryKey: INVOICE_KEYS.RETURNABLE({ ...body, branchId } as Record<string, unknown>),
    queryFn: async () => {
      const res = await invoiceService.searchReturnable(body);
      const rows = res.data.map((inv) =>
        mapInvoiceToReturnRow(inv, inv.customer ?? null, inv.branch?.name ?? ""),
      );
      return { rows, total: res.total };
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Danh sách hóa đơn v2 — POST /v2/invoices/search, server-side filter + pagination.
 * Enrich mã/tên/SĐT khách qua `customerService.get` giống hook cũ.
 * `placeholderData: keepPreviousData` giữ dữ liệu cũ trong khi load trang/filter mới.
 */
export function useInvoiceListV2Query(
  body: SearchInvoicesV2Body,
): UseQueryResult<{ rows: InvoiceListRow[]; total: number }, Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<{ rows: InvoiceListRow[]; total: number }, Error>({
    queryKey: INVOICE_KEYS.SEARCH_V2({ ...body, branchId } as Record<string, unknown>),
    queryFn: async () => {
      const res = await invoiceService.searchV2(body);
      const ids = Array.from(
        new Set(
          res.data
            .map((inv) => inv.customerId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const customer = await customerService.get(id);
            return [
              id,
              { code: customer.code, name: customer.name, phone: customer.phone },
            ] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      const byId = new Map(entries);
      const rows = res.data.map((inv) =>
        mapInvoiceToListRow(
          inv,
          inv.customerId ? byId.get(inv.customerId) ?? null : null,
        ),
      );
      return { rows, total: res.total };
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Danh sách hóa đơn cho trang `/invoices` — gồm cả bán/trả/đổi (`isDraft=false`,
 * không lọc status). Enrich mã/tên/SĐT khách qua `customerService.get` (endpoint
 * list chỉ trả `customerId`). Lọc theo ngày/cột + phân trang làm client-side ở
 * page-hook (`use-invoice-list`).
 */
export function useInvoiceListQuery(): UseQueryResult<InvoiceListRow[], Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  return useQuery<InvoiceListRow[], Error>({
    queryKey: INVOICE_KEYS.LIST({ branchId }),
    queryFn: async () => {
      const page = await invoiceService.list({
        isDraft: false,
        page: 1,
        limit: INVOICE_LIST_DEFAULT_PAGE_SIZE,
      });
      const ids = Array.from(
        new Set(
          page.data
            .map((inv) => inv.customerId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const customer = await customerService.get(id);
            return [
              id,
              {
                code: customer.code,
                name: customer.name,
                phone: customer.phone,
              },
            ] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      const byId = new Map(entries);
      return page.data.map((inv) =>
        mapInvoiceToListRow(
          inv,
          inv.customerId ? byId.get(inv.customerId) ?? null : null,
        ),
      );
    },
    staleTime: 30_000,
  });
}

/** `GET /invoices/:id/eligible-returns` — dòng hàng còn được phép trả. */
export function useEligibleReturnsQuery(
  invoiceId: string | undefined,
): UseQueryResult<EligibleReturnLine[], Error> {
  return useQuery<EligibleReturnLine[], Error>({
    queryKey: INVOICE_KEYS.ELIGIBLE_RETURNS(invoiceId ?? ""),
    queryFn: () => invoiceService.getEligibleReturns(invoiceId as string),
    enabled: Boolean(invoiceId),
    staleTime: 30_000,
  });
}

export function useCreateReturnInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CreateReturnInvoiceBody
> {
  return useMutation<InvoiceRow, Error, CreateReturnInvoiceBody>({
    mutationFn: (body) => invoiceService.createReturn(body),
  });
}

export function useCreateExchangeInvoiceMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CreateExchangeInvoiceBody
> {
  return useMutation<InvoiceRow, Error, CreateExchangeInvoiceBody>({
    mutationFn: (body) => invoiceService.createExchange(body),
  });
}

interface CheckoutReturnVars {
  id: string;
  body: CheckoutReturnBody;
}

export function useCheckoutReturnMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  CheckoutReturnVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, CheckoutReturnVars>({
    mutationFn: ({ id, body }) => invoiceService.checkoutReturn(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.ALL });
      // Trả/đổi hàng thay đổi tồn kho — refetch catalog như checkout bán.
      void qc.invalidateQueries({ queryKey: CATALOG_KEYS.ALL });
    },
  });
}

// ─── Loyalty redeem (TKT-039 / loyalty-pos-fe-api-integration) ──────────────

interface RedeemPointsVars {
  id: string;
  points: number;
}

/**
 * `POST /invoices/:id/redeem-points` — ghi `pointsRedeemed` vào draft. Chỉ
 * gọi ở bước finalize (sau khi đã có invoiceId từ create/update), không gọi
 * khi user nhấn "Áp dụng" trong dialog.
 */
export function useRedeemPointsMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  RedeemPointsVars
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, RedeemPointsVars>({
    mutationFn: ({ id, points }) =>
      invoiceService.redeemPoints(id, { points }),
    onSuccess: (_inv, { id }) => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DETAIL(id) });
      // Điểm trên card chỉ giảm thực sự khi checkout commit, nhưng vẫn bust
      // cache `customers/:id/summary` để lần mở dialog kế tiếp đọc số mới.
      void qc.invalidateQueries({ queryKey: CUSTOMER_KEYS.ALL });
    },
  });
}

/** `DELETE /invoices/:id/redeem-points` — gỡ đổi điểm khỏi draft. */
export function useClearRedeemPointsMutation(): UseMutationResult<
  InvoiceRow,
  Error,
  { id: string }
> {
  const qc = useQueryClient();
  return useMutation<InvoiceRow, Error, { id: string }>({
    mutationFn: ({ id }) => invoiceService.clearRedeemPoints(id),
    onSuccess: (_inv, { id }) => {
      void qc.invalidateQueries({ queryKey: INVOICE_KEYS.DETAIL(id) });
    },
  });
}
