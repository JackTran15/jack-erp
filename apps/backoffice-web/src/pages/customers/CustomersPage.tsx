import { useState } from "react";
import { toast } from "sonner";
import { CrudListPage } from "../../components/crud/CrudListPage";
import { CustomerSelectDialog } from "./_components/export/CustomerSelectDialog";
import { ImportCustomersDialog } from "./_components/import/ImportCustomersDialog";
import {
  downloadCustomersExport,
  downloadCustomersExportSelected,
} from "./_components/import/import-customers.api";

export function CustomersPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportSelectOpen, setExportSelectOpen] = useState(false);

  return (
    <CrudListPage
      entityKey="customers"
      initialSort={{ sortBy: "code", sortOrder: "asc" }}
      inventoryConfig={{
        onImportInventory: () => setImportDialogOpen(true),
        onExportInventoryAll: () => {
          void downloadCustomersExport()
            .then(() => toast.success("Đã tải tệp xuất khẩu"))
            .catch((err: unknown) =>
              toast.error(
                err instanceof Error ? err.message : "Xuất khẩu thất bại",
              ),
            );
        },
        onExportInventorySelected: () => setExportSelectOpen(true),
        exportOptions: [
          {
            id: "customers-export-all",
            label: "Tất cả khách hàng",
            action: "export-all",
          },
          {
            id: "customers-export-selected",
            label: "Khách hàng được chọn",
            action: "export-selected",
          },
        ],
        renderDialogs: (context) => (
          <>
            {importDialogOpen ? (
              <ImportCustomersDialog
                open
                onOpenChange={setImportDialogOpen}
                onCommitted={() => context.refetchRecords()}
              />
            ) : null}
            {exportSelectOpen ? (
              <CustomerSelectDialog
                open
                onOpenChange={setExportSelectOpen}
                confirmLabel="Xuất khẩu"
                onConfirm={(customerIds) => {
                  void downloadCustomersExportSelected(customerIds)
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
