import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CrudListPage } from "../../components/crud/CrudListPage";
import { ImportCategoriesDialog } from "./_components/category-import/ImportCategoriesDialog";
import { downloadCategoriesExport } from "./_components/category-import/import-categories.api";

export function ItemCategoriesPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  return (
    <CrudListPage
      entityKey="inventory-item-categories"
      inventoryConfig={{
        onImportInventory: () => setImportDialogOpen(true),
        onExportInventoryAll: () => {
          void downloadCategoriesExport()
            .then(() => toast.success("Đã tải tệp xuất khẩu"))
            .catch((err: unknown) =>
              toast.error(
                err instanceof Error ? err.message : "Xuất khẩu thất bại",
              ),
            );
        },
        renderDialogs: (context) =>
          importDialogOpen ? (
            <ImportCategoriesDialog
              open
              onOpenChange={setImportDialogOpen}
              onCommitted={() => {
                context.refetchRecords();
                // The category page renders from its own tree query, not the
                // generic records query — bust it so the new tree shows up.
                void queryClient.invalidateQueries({
                  queryKey: ["item-category-tree"],
                });
              }}
            />
          ) : null,
      }}
    />
  );
}
