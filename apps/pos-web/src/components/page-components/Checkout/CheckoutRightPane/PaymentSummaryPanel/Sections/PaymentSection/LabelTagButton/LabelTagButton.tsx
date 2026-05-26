import { useState } from "react";
import { TagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  selectSelectedLabelIds,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { LabelTagDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/LabelTagDialog/LabelTagDialog";

export function LabelTagButton() {
  const [open, setOpen] = useState(false);
  const selectedCount = usePosCheckoutSessionStore(
    (s) => selectSelectedLabelIds(s).length,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-[14px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      >
        <TagIcon size={16} className="text-gray-500" />
        Gán nhãn{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </button>
      <LabelTagDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
