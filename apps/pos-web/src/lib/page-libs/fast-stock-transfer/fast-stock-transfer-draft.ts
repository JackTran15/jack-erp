import type { FastStockTransferToolbarDraft } from "@erp/pos/interfaces/fast-stock-transfer.interface";

export function isFastStockTransferDraftCompleteForAdd(
  draft: FastStockTransferToolbarDraft,
): boolean {
  if (!draft.product) return false;
  if (draft.product.locations.length > 0 && !draft.location) return false;
  return true;
}

export function isFastStockTransferDraftCompleteForSave(
  draft: FastStockTransferToolbarDraft,
): boolean {
  return isFastStockTransferDraftCompleteForAdd(draft);
}
