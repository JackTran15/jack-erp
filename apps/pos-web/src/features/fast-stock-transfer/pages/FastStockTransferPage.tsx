import { AppHeader } from "@erp/pos/components/layout/appHeader/AppHeader";
import { usePosBranchStore } from "@erp/pos/stores/usePosBranchStore";
import { FastStockTransferConfirmDialog } from "../components/FastStockTransferConfirmDialog";
import { FastStockTransferTable } from "../components/FastStockTransferTable";
import { FastStockTransferToolbar } from "../components/FastStockTransferToolbar";
import { useFastStockTransfer } from "../hooks/useFastStockTransfer";

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
      <AppHeader
        title="Chuyển kho tạm"
        location={branchName}
        userName="Phan Thanh Hà"
      />

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
