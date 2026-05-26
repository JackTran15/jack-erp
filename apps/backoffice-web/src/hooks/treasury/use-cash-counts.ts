import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type {
  CashCount,
  CashCountListQuery,
  CashCountPostResult,
  CreateCashCountBody,
  PaginatedList,
} from "../../pages/treasury/cash-vouchers.types";
import type { CashCountParticipant } from "../../pages/treasury/cash/cash-count/cash-count.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useCashCountsList(query: CashCountListQuery, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashCounts(query),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<PaginatedList<CashCount>>("/cash-counts", {
          params: { query: query as Record<string, unknown> },
        }),
      ),
    enabled,
    staleTime: 30_000,
  });
}

export function useCashCount(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashCount(id),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CashCount>("/cash-counts/{id}", {
          params: { path: { id: id! } },
        }),
      ),
    enabled: enabled && Boolean(id),
  });
}

export function useCashCountMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cash-counts"] });
    void qc.invalidateQueries({ queryKey: ["cash-ledger"] });
    void qc.invalidateQueries({ queryKey: ["cash-receipts"] });
    void qc.invalidateQueries({ queryKey: ["cash-payments"] });
  };

  const create = useMutation({
    mutationFn: async (body: CreateCashCountBody) =>
      requireErpData(await erpApi.POST<CashCount>("/cash-counts", { body })),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Partial<CreateCashCountBody>;
    }) =>
      requireErpData(
        await erpApi.PATCH<CashCount>("/cash-counts/{id}", {
          params: { path: { id } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: async (id: string) =>
      requireErpData(
        await erpApi.POST<CashCountPostResult>("/cash-counts/{id}/post", {
          params: { path: { id } },
        }),
      ),
    onSuccess: invalidate,
  });

  return { create, update, post };
}

/** UI-only participants (G6 — not persisted to BE). */
const PARTICIPANTS_KEY = "erp.cash-count.participants";

export function loadCashCountParticipants(
  countId: string,
): CashCountParticipant[] {
  try {
    const raw = localStorage.getItem(`${PARTICIPANTS_KEY}:${countId}`);
    if (!raw) return [];
    return JSON.parse(raw) as CashCountParticipant[];
  } catch {
    return [];
  }
}

export function saveCashCountParticipants(
  countId: string,
  participants: CashCountParticipant[],
): void {
  localStorage.setItem(
    `${PARTICIPANTS_KEY}:${countId}`,
    JSON.stringify(participants),
  );
}
