import { http } from "../lib/common/http";
import type {
  AccountRow,
  ListAccountsParams,
} from "@erp/pos/dtos/account.dto";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";
export type { AccountRow, ListAccountsParams } from "@erp/pos/dtos/account.dto";
export type { Paginated } from "@erp/pos/interfaces/paginated.interface";

export const accountService = {
  listAccounts: async (
    params: ListAccountsParams = {},
  ): Promise<Paginated<AccountRow>> => {
    const qs = new URLSearchParams();
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
    if (params.filters) qs.set("filters", JSON.stringify(params.filters));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<Paginated<AccountRow>>(`/cash/accounts${suffix}`);
  },

  listPaymentAccounts: (): Promise<Paginated<AccountRow>> => {
    const qs = new URLSearchParams();
    qs.set("page", String(1));
    qs.set("pageSize", String(100))
    qs.set("filters", JSON.stringify({  type: 'ASSET', isActive: true }));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return http.get<Paginated<AccountRow>>(`/accounts${suffix}`);    
  }
};
