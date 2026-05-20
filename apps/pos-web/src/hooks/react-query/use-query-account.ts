import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { ACCOUNT_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { accountService } from "@erp/pos/services/account.service";
import type { AccountRow } from "@erp/pos/interfaces/account.interface";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";

const STALE_TIME_MS = 5 * 60_000;

export const usePaymentAccountsQuery = () => {
  const query = useQuery({
    queryKey: ACCOUNT_KEYS.PAYMENT,
    queryFn: () => accountService.listPaymentAccounts(),
    staleTime: STALE_TIME_MS,
  });

  return {
    accounts: query.data?.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
  };
}

/** REVENUE accounts (lấy item đầu tiên isActive làm default revenueAccountId). */
export function useRevenueAccountsQuery(): UseQueryResult<
  Paginated<AccountRow>,
  Error
> {
  return useQuery({
    queryKey: ACCOUNT_KEYS.REVENUE,
    queryFn: () =>
      accountService.listAccounts({
        filters: { type: "REVENUE", isActive: true },
        page: 1,
        pageSize: 50,
      }),
    staleTime: STALE_TIME_MS,
  });
}

/**
 * Receivable (AR) account — convention `code` bắt đầu bằng "131" trong nhóm
 * ASSET. Backend chưa expose default, frontend tự lọc trong list.
 */
export function useReceivableAccountsQuery(): UseQueryResult<
  Paginated<AccountRow>,
  Error
> {
  return useQuery({
    queryKey: ACCOUNT_KEYS.RECEIVABLE,
    queryFn: () =>
      accountService.listAccounts({
        filters: { type: "ASSET", isActive: true },
        page: 1,
        pageSize: 100,
      }),
    staleTime: STALE_TIME_MS,
  });
}

/** Tiện ích chọn item đầu tiên có code prefix khớp (e.g. "131" cho AR). */
export function pickAccountByCodePrefix(
  accounts: AccountRow[] | undefined,
  prefix: string,
): AccountRow | null {
  if (!accounts || accounts.length === 0) return null;
  return accounts.find((a) => a.code?.startsWith(prefix)) ?? accounts[0] ?? null;
}
