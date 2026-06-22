import type { FastStockTransferToolbarDraft } from "@erp/pos/interfaces/fast-stock-transfer.interface";

export function isFastStockTransferDraftCompleteForAdd(
  draft: FastStockTransferToolbarDraft,
): boolean {
  return !!draft.product;
}

export function isFastStockTransferDraftCompleteForSave(
  draft: FastStockTransferToolbarDraft,
): boolean {
  return isFastStockTransferDraftCompleteForAdd(draft);
}
