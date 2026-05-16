import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { FastStockTransferConfirmDialog } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferConfirmDialog/FastStockTransferConfirmDialog";
import { FastStockTransferTable } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferTable/FastStockTransferTable";
import { FastStockTransferToolbar } from "@erp/pos/components/page-components/FastStockTransfer/FastStockTransferToolbar/FastStockTransferToolbar";
import { useFastStockTransfer } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer";

export function FastStockTransferPage() {
  const branchName = usePosBranchStore((s) => s.branchName) ?? "—";
  const {
    mode,
    setMode,
    filters,
    setFilter,
    rows,
    editingRowId,
    editableDraft,
    canProcess,
    canCloseTransfer,
    warehouseOptions,
    isDialogOpen,
    selectedDialogRows,
    handleAddRow,
    handleStartEdit,
    handleEditField,
    handleSaveRow,
    handleToggleTransfer,
    handleOpenProcessDialog,
    handleCloseProcessDialog,
    handleConfirmProcess,
    handleResetData,
  } = useFastStockTransfer();

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <FastStockTransferToolbar
          mode={mode}
          onModeChange={setMode}
          filters={filters}
          warehouseOptions={warehouseOptions}
          onFilterChange={setFilter}
          onAddRow={handleAddRow}
          onResetData={handleResetData}
          onProcessTransfer={handleOpenProcessDialog}
          canProcessTransfer={canProcess}
          canCloseTransfer={canCloseTransfer}
        />

        <FastStockTransferTable
          rows={rows}
          editingRowId={editingRowId}
          editableDraft={editableDraft}
          filters={filters}
          setFilter={setFilter}
          onStartEdit={handleStartEdit}
          onEditField={handleEditField}
          onSaveRow={handleSaveRow}
          onToggleTransfer={handleToggleTransfer}
        />
      </div>

      <FastStockTransferConfirmDialog
        open={isDialogOpen}
        rows={selectedDialogRows}
        onClose={handleCloseProcessDialog}
        onConfirm={handleConfirmProcess}
      />
    </div>
  );
}
