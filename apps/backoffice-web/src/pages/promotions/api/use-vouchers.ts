import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { PromotionStatus } from "@erp/shared-interfaces";
import { erpApi, requireErpData, requireErpSuccess } from "../../../lib/erp-api";
import type { CompareFilter, DateRangeFilter, EnumFilter, StringFilter } from "./use-promotions";

/** Body fields of `POST /v2/vouchers/search` besides `page`/`limit` — mirrors `VoucherSearchV2Dto`. */
export interface VoucherSearchFilters {
  issuer?: StringFilter;
  code?: StringFilter;
  description?: StringFilter;
  startDate?: DateRangeFilter;
  endDate?: DateRangeFilter;
  status?: EnumFilter;
  faceValue?: CompareFilter;
}

/** One row of `POST /v2/vouchers/search` — mirrors `VoucherSummaryRow` (apps/api); the 3 totals are computed in RAM, not stored columns (FR-050). */
export interface VoucherSummaryRow {
  issuer?: string;
  code: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  faceValue: number;
  totalQuantity: number;
  totalVoucherValue: number;
  totalAppliedValue: number;
  status: PromotionStatus;
}

export interface VoucherSearchResponse {
  data: VoucherSummaryRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    totalQuantity: number;
    totalVoucherValue: number;
    totalAppliedValue: number;
  };
}

/** Mirrors `VoucherEntity` — the shape create/update/duplicate/deactivate return. */
export interface VoucherDetail {
  id: string;
  code: string;
  issuer?: string;
  description?: string;
  status: PromotionStatus;
  faceValue: number;
  customerId?: string;
  validFrom?: string;
  validTo?: string;
  isUsed: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoucherRequest {
  code: string;
  issuer: string;
  description?: string;
  status?: PromotionStatus;
  faceValue: number;
  customerId?: string;
  /** Omit for an unlimited-duration voucher (FR-051). */
  validFrom?: string;
  validTo?: string;
}

/** Thẻ voucher — server-side filter/phân trang (FR-050). */
export function useVouchersQuery(
  page: number,
  limit: number,
  filters: VoucherSearchFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ["vouchers", page, limit, filters],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<VoucherSearchResponse>("/v2/vouchers/search", {
          body: { page, limit, ...filters },
        }),
      ),
    enabled,
  });
}

function invalidateVouchers(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["vouchers"] });
}

export function useCreateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateVoucherRequest) =>
      requireErpData(await erpApi.POST<VoucherDetail>("/v2/vouchers", { body })),
    onSuccess: () => invalidateVouchers(qc),
  });
}

export function useUpdateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<CreateVoucherRequest> }) =>
      requireErpData(
        await erpApi.PUT<VoucherDetail>("/v2/vouchers/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidateVouchers(qc),
  });
}

/** FR-051 — nhân bản voucher; mã mới bắt buộc nhập tay (voucher không có auto-numbering). */
export function useDuplicateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, code }: { id: string; code: string }) =>
      requireErpData(
        await erpApi.POST<VoucherDetail>("/v2/vouchers/{id}/duplicate", {
          params: { path: { id } },
          body: { code },
        }),
      ),
    onSuccess: () => invalidateVouchers(qc),
  });
}

/** `DELETE /v2/vouchers/:id` is a soft `VoucherService.deactivate` (200 + updated entity, not a hard delete). */
export function useDeactivateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/v2/vouchers/{id}", { params: { path: { id } } }),
      ),
    onSuccess: () => invalidateVouchers(qc),
  });
}
