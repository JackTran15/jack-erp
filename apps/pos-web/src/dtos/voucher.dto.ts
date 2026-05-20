import type { VoucherApplyScope } from "@erp/pos/constants/checkout.constant";

export interface VoucherFormResult {
  voucherId: string | null;
  qty: number;
  voucherCode: string;
  scope: VoucherApplyScope;
  /** IDs from `data.items` when scope === "ITEMS". */
  selectedItemIds: string[];
  /** IDs from `data.groups` when scope === "GROUPS". */
  selectedGroupIds: string[];
}
