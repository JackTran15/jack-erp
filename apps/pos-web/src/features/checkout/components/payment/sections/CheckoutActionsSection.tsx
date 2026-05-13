import type { CashSuggestion } from "../../types";
import { CashSuggestionList } from "../CashSuggestionList";
import { PaymentCTAButtons } from "../PaymentCTAButtons";
import { PrintAndOrderRow } from "../PrintAndOrderRow";

interface CheckoutActionsSectionProps {
  printInvoice: boolean;
  onPrintInvoiceChange: (next: boolean) => void;
  preorder: boolean;
  onPreorderChange: (next: boolean) => void;
  suggestions: CashSuggestion[];
  selectedSuggestionId: string | null;
  onPickSuggestion: (s: CashSuggestion) => void;
  onSaveDraft?: () => void;
  onCancelInvoice?: () => void;
  onCollect: () => void | Promise<void>;
  collectDisabled?: boolean;
}

export function CheckoutActionsSection({
  printInvoice,
  onPrintInvoiceChange,
  preorder,
  onPreorderChange,
  suggestions,
  selectedSuggestionId,
  onPickSuggestion,
  onSaveDraft,
  onCancelInvoice,
  onCollect,
  collectDisabled,
}: CheckoutActionsSectionProps) {
  return (
    <div className="border-t border-gray-200 bg-white">
      <PrintAndOrderRow
        printInvoice={printInvoice}
        onPrintInvoiceChange={onPrintInvoiceChange}
        preorder={preorder}
        onPreorderChange={onPreorderChange}
      />
      {suggestions.length > 0 ? (
        <div className="py-3">
          <CashSuggestionList
            suggestions={suggestions}
            selectedId={selectedSuggestionId}
            onPick={onPickSuggestion}
          />
        </div>
      ) : null}
      <PaymentCTAButtons
        onSaveDraft={onSaveDraft}
        onCancelInvoice={onCancelInvoice}
        onCollect={onCollect}
        collectDisabled={collectDisabled}
      />
    </div>
  );
}
