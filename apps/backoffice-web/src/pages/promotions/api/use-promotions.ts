import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { PromotionProgramSummary, PromotionProgramDetail, PromotionStatus } from "@erp/shared-interfaces";
import { erpApi, requireErpData, requireErpSuccess } from "../../../lib/erp-api";
import { HttpError } from "../../../lib/http";
import type { CreatePromotionRequest } from "./promotion.mapper";

export interface StringFilter {
  operator: "*" | "=" | "+" | "-" | "!";
  value: string;
}

export interface EnumFilter {
  value: string | null;
}

export interface DateRangeFilter {
  from?: string;
  to?: string;
}

export interface CompareFilter {
  operator: "=" | "<" | "<=" | ">" | ">=";
  value: string | number;
}

/** Body fields of `POST /v2/promotions/search` besides `page`/`limit` — mirrors `PromotionSearchV2Dto`. */
export interface PromotionSearchFilters {
  name?: StringFilter;
  description?: StringFilter;
  type?: EnumFilter;
  status?: EnumFilter;
  applyTo?: EnumFilter;
  startDate?: DateRangeFilter;
  endDate?: DateRangeFilter;
}

export interface PromotionSearchResponse {
  data: PromotionProgramSummary[];
  total: number;
  page: number;
  limit: number;
}

/** `DomainValidationError.issues` surfaced through a 400 — see `rethrowDomainError` (apps/api). */
export interface PromotionValidationIssue {
  field: string;
  code: string;
  message: string;
}

/** Pulls BR-004's per-field issues out of a create/update mutation error, for binding to the form's fields instead of a generic toast. */
export function getPromotionIssues(error: unknown): PromotionValidationIssue[] | undefined {
  if (!(error instanceof HttpError)) return undefined;
  const details = error.error.details;
  if (!details || typeof details !== "object") return undefined;
  const issues = (details as Record<string, unknown>).issues;
  return Array.isArray(issues) ? (issues as PromotionValidationIssue[]) : undefined;
}

/** Danh sách CTKM — server-side filter/phân trang (FR-002/003/005). */
export function usePromotionsQuery(
  page: number,
  limit: number,
  filters: PromotionSearchFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: ["promotions", page, limit, filters],
    queryFn: async () =>
      requireErpData(
        await erpApi.POST<PromotionSearchResponse>("/v2/promotions/search", {
          body: { page, limit, ...filters },
        }),
      ),
    enabled,
  });
}

/** Một CTKM đầy đủ aggregate — dùng để prefill form Sửa/Nhân bản (FR-007/008). */
export function usePromotionQuery(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["promotion", id],
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PromotionProgramDetail>("/v2/promotions/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

function invalidatePromotions(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["promotions"] });
  void qc.invalidateQueries({ queryKey: ["promotion"] });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePromotionRequest) =>
      requireErpData(await erpApi.POST<PromotionProgramDetail>("/v2/promotions", { body })),
    onSuccess: () => invalidatePromotions(qc),
  });
}

export function useUpdatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CreatePromotionRequest }) =>
      requireErpData(
        await erpApi.PUT<PromotionProgramDetail>("/v2/promotions/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: () => invalidatePromotions(qc),
  });
}

/** FR-008 — nhân bản, không ghi dữ liệu (server copy trọn aggregate ngay, FE mở form Sửa với kết quả). */
export function useDuplicatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<PromotionProgramDetail>("/v2/promotions/{id}/duplicate", {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => invalidatePromotions(qc),
  });
}

export function useChangePromotionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PromotionStatus }) =>
      requireErpData(
        await erpApi.PATCH<PromotionProgramDetail>("/v2/promotions/{id}/status", {
          params: { path: { id } },
          body: { status },
        }),
      ),
    onSuccess: () => invalidatePromotions(qc),
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      requireErpSuccess(
        await erpApi.DELETE("/v2/promotions/{id}", { params: { path: { id } } }),
      ),
    onSuccess: () => invalidatePromotions(qc),
  });
}
