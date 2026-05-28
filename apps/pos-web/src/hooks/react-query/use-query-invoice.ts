import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  CUSTOMER_KEYS,
  INVOICE_KEYS,
} from "@erp/pos/constants/react-query-key.constant";
import { RETURN_GOODS_DEFAULT_PAGE_SIZE } from "@erp/pos/constants/return-goods.constant";
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
  sessionId: string;
  enabled?: boolean;
}

export function useDraftInvoicesQuery(
  input: UseDraftInvoicesQueryInput,
): UseQueryResult<InvoiceRow[], Error> {
  return useQuery<InvoiceRow[], Error>({
    queryKey: INVOICE_KEYS.DRAFTS(input.sessionId),
    queryFn: () => invoiceService.listDrafts(input.sessionId),
    enabled: Boolean(input.sessionId) && (input.enabled ?? true),
    staleTime: 5_000,
  });
}

// ─── Return / Exchange (EPIC-011) ───────────────────────────────────────────

interface UseReturnableInvoicesQueryInput {
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}

/**
 * Hóa đơn đã thanh toán (`status=paid`) cho trang đổi trả. Enrich tên/sđt khách
 * qua `customerService.get` (endpoint list chỉ trả `customerId`). `branchName`
 * lấy từ branch store — POS scope 1 chi nhánh, BE đã lọc theo `X-Branch-Id`.
 */
export function useReturnableInvoicesQuery(
  input: UseReturnableInvoicesQueryInput = {},
): UseQueryResult<ReturnInvoiceRow[], Error> {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const branchName = usePosBranchStore((s) => s.branchName) ?? "—";
  return useQuery<ReturnInvoiceRow[], Error>({
    queryKey: INVOICE_KEYS.RETURNABLE({
      branchId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    }),
    queryFn: async () => {
      const page = await invoiceService.list({
        status: "paid",
        isDraft: false,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: 1,
        limit: RETURN_GOODS_DEFAULT_PAGE_SIZE,
      });
      // Chỉ hóa đơn BÁN mới đổi/trả được. Đơn RETURN/EXCHANGE sau tất toán cũng
      // `status=paid` nên lọt vào list — loại trừ chúng để bấm vào không bị BE
      // báo "only SALE can be returned". Lọc kiểu loại trừ (giữ SALE + thiếu type)
      // để an toàn nếu response không kèm `type`.
      const saleInvoices = page.data.filter(
        (inv) => inv.type !== "RETURN" && inv.type !== "EXCHANGE",
      );
      const ids = Array.from(
        new Set(
          saleInvoices
            .map((inv) => inv.customerId)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const customer = await customerService.get(id);
            return [id, { name: customer.name, phone: customer.phone }] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      const byId = new Map(entries);
      return saleInvoices.map((inv) =>
        mapInvoiceToReturnRow(
          inv,
          inv.customerId ? byId.get(inv.customerId) ?? null : null,
          branchName,
        ),
      );
    },
    enabled: input.enabled ?? true,
    staleTime: 30_000,
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
