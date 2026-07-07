import { useState } from "react";
import { toast } from "sonner";
import {
  CrudListPage,
  type CrudListInventoryActionContext,
} from "../../components/crud/CrudListPage";
import { ProductSelectDialog } from "../../components/shared/product-select/ProductSelectDialog";
import { setItemsActiveStatus } from "../../api/inventory-items";
import { ImportInventoryDialog } from "./_components/import/ImportInventoryDialog";
import {
  downloadInventoryExport,
  downloadInventoryExportSelected,
} from "./_components/import/import-inventory.api";

export function InventoryItemsPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportSelectOpen, setExportSelectOpen] = useState(false);

  const applyTracking = (
    ctx: CrudListInventoryActionContext,
    isActive: boolean,
  ) => {
    if (ctx.selectedRecordIds.length === 0) return;
    const count = ctx.selectedRecordIds.length;
    setItemsActiveStatus(ctx.selectedRecordIds, isActive)
      .then(() => {
        toast.success(
          isActive
            ? `Đã sử dụng lại ${count} hàng hoá.`
            : `Đã ngừng theo dõi ${count} hàng hoá.`,
        );
        ctx.refetchRecords();
      })
      .catch((err: unknown) =>
        toast.error(
          err instanceof Error ? err.message : "Cập nhật trạng thái thất bại",
        ),
      );
  };

  return (
    <CrudListPage
      entityKey="inventory-items"
      initialSort={{ sortBy: "code", sortOrder: "asc" }}
      disableRowClick
      inventoryConfig={{
        onImportInventory: () => setImportDialogOpen(true),
        onExportInventoryAll: () => {
          void downloadInventoryExport()
            .then(() => toast.success("Đã tải tệp xuất khẩu"))
            .catch((err: unknown) =>
              toast.error(
                err instanceof Error ? err.message : "Xuất khẩu thất bại",
              ),
            );
        },
        onExportInventorySelected: () => setExportSelectOpen(true),
        onStopTracking: (ctx) => applyTracking(ctx, false),
        onResumeTracking: (ctx) => applyTracking(ctx, true),
        exportOptions: [
          {
            id: "inventory-export-all",
            label: "Tất cả hàng hoá",
            action: "export-all",
          },
          {
            id: "inventory-export-selected",
            label: "Hàng hoá được chọn",
            action: "export-selected",
          },
        ],
        renderDialogs: (context) => (
          <>
            {importDialogOpen ? (
              <ImportInventoryDialog
                open
                onOpenChange={setImportDialogOpen}
                onCommitted={() => context.refetchRecords()}
              />
            ) : null}
            {exportSelectOpen ? (
              <ProductSelectDialog
                open
                onOpenChange={setExportSelectOpen}
                confirmLabel="Xuất khẩu"
                onConfirm={(result) => {
                  downloadInventoryExportSelected(
                    result.standaloneItemIds,
                    result.fullySelectedProductIds,
                  )
                    .then(() => toast.success("Đã tải tệp xuất khẩu"))
                    .catch((err: unknown) =>
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Xuất khẩu thất bại",
                      ),
                    );
                }}
              />
            ) : null}
          </>
        ),
      }}
    />
  );
}
