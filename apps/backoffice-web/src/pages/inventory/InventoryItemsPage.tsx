import { useState } from "react";
import { toast } from "sonner";
import { CrudListPage } from "../../components/crud/CrudListPage";
import { InventoryExportSelectDialog } from "./_components/InventoryExportSelectDialog";
import { ImportInventoryDialog } from "./_components/import/ImportInventoryDialog";
import { downloadInventoryExport } from "./_components/import/import-inventory.api";

export function InventoryItemsPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportSelectOpen, setExportSelectOpen] = useState(false);
  const [exportInitialIds, setExportInitialIds] = useState<Set<string>>(
    new Set(),
  );

  return (
    <CrudListPage
      entityKey="inventory-items"
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
        onExportInventorySelected: (context) => {
          setExportInitialIds(new Set(context.selectedRecordIds));
          setExportSelectOpen(true);
        },
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
              <InventoryExportSelectDialog
                open
                onOpenChange={setExportSelectOpen}
                initialSelectedIds={exportInitialIds}
                onConfirm={(ids) => {
                  toast.info(`Đã chọn ${ids.size} hàng hóa để xuất khẩu.`);
                }}
              />
            ) : null}
          </>
        ),
      }}
    />
  );
}
