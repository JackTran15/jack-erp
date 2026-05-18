import { FAST_STOCK_TRANSFER_TAB_OPTIONS } from "@erp/pos/constants/fast-stock-transfer.constant";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import { cn } from "@erp/ui";

export function DirectionTabs() {
  const direction = usePosFastStockTransferWorkflowStore((s) => s.direction);
  const { setDirection } = useFastStockTransferActions();

  return (
    <div className="flex items-center gap-6">
      {FAST_STOCK_TRANSFER_TAB_OPTIONS.map((tab) => {
        const active = tab.id === direction;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setDirection(tab.id)}
            className={cn(
              "relative py-1 text-[14px] font-semibold transition-colors",
              active
                ? "text-[#3B82F6]"
                : "text-[#9CA3AF] hover:text-[#6B7280]",
            )}
          >
            {tab.label}
            {active ? (
              <span className="absolute inset-x-0 -bottom-2 h-0.5 rounded bg-[#3B82F6]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
