import { PosErrorDialog } from "@erp/pos/components/common/PosErrorDialog/PosErrorDialog";
import { FastStockTransferConfirmDialog } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferConfirmDialog/FastStockTransferConfirmDialog";
import { FastStockTransferDiscrepancyDialog } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferDiscrepancyDialog/FastStockTransferDiscrepancyDialog";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import { usePosFastStockTransferUiStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-ui.store";

export function FastStockTransferDialogs() {
  const pageError = usePosFastStockTransferUiStore((s) => s.pageError);
  const clearPageError = usePosFastStockTransferUiStore((s) => s.clearPageError);
  const isProcessDialogOpen = usePosFastStockTransferUiStore(
    (s) => s.isProcessDialogOpen,
  );
  const isDiscrepancyDialogOpen = usePosFastStockTransferUiStore(
    (s) => s.isDiscrepancyDialogOpen,
  );

  const { selectedDialogRows, discrepancyItems, netOffsetEligible } =
    useFastStockTransferData();
  const {
    handleCloseProcessDialog,
    handleConfirmProcess,
    handleCloseDiscrepancyDialog,
    handleConfirmDiscrepancyDialog,
  } = useFastStockTransferActions();

  return (
    <>
      <FastStockTransferConfirmDialog
        open={isProcessDialogOpen}
        rows={selectedDialogRows}
        onClose={handleCloseProcessDialog}
        onConfirm={handleConfirmProcess}
      />
      <FastStockTransferDiscrepancyDialog
        open={isDiscrepancyDialogOpen}
        items={discrepancyItems}
        netOffsetEligible={netOffsetEligible}
        onClose={handleCloseDiscrepancyDialog}
        onConfirm={handleConfirmDiscrepancyDialog}
      />
      <PosErrorDialog
        open={Boolean(pageError)}
        message={pageError}
        onClose={clearPageError}
      />
    </>
  );
}
