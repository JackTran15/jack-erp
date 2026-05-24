import { http } from "@erp/pos/lib/common/http";
import type {
  AccountRow,
  PaymentAccountRow,
} from "@erp/pos/interfaces/account.interface";
import type { ListAccountsParams } from "@erp/pos/dtos/account.dto";
import type { Paginated } from "@erp/pos/interfaces/paginated.interface";

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

  /**
   * Danh sách tài khoản nhận tiền đã cấu hình cho chi nhánh hiện tại (BE tự scope
   * theo org + branch qua `X-Branch-Id`). Dùng cho picker thanh toán ở checkout.
   */
  listPaymentAccounts: (): Promise<PaymentAccountRow[]> => {
    return http.get<PaymentAccountRow[]>(`/payment-accounts`);
  },
};
