import { useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@erp/ui";
import {
  CrudListPage,
  type CrudListInventoryActionContext,
} from "../../components/crud/CrudListPage";
import { usePermissionCheck } from "../../hooks/usePermissionCheck";
import { setItemActiveStatus } from "./_components/set-item-active-status.api";
import { ProductSelectDialog } from "../../components/shared/product-select/ProductSelectDialog";
import { ImportInventoryDialog } from "./_components/import/ImportInventoryDialog";
import {
  downloadInventoryExport,
  downloadInventoryExportSelected,
} from "./_components/import/import-inventory.api";

interface PendingStatusChange {
  isActive: boolean;
  ids: string[];
  context: CrudListInventoryActionContext;
}

export function InventoryItemsPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportSelectOpen, setExportSelectOpen] = useState(false);
  // Confirmation is not optional here: the grid re-selects the first row
  // whenever the selection would empty, so "nothing selected" is unreachable and
  // a menu click always has at least one target. The dialog is what makes the
  // count visible before anything is written.
  const [pendingStatus, setPendingStatus] =
    useState<PendingStatusChange | null>(null);
  const [applying, setApplying] = useState(false);
  const canWrite = usePermissionCheck(["inventory.write"]).has(
    "inventory.write",
  );

  const askStatusChange =
    (isActive: boolean) => (context: CrudListInventoryActionContext) => {
      if (!context.selectedRecordIds.length) return;
      setPendingStatus({ isActive, ids: context.selectedRecordIds, context });
    };

  const applyStatusChange = async () => {
    if (!pendingStatus) return;
    setApplying(true);
    try {
      const result = await setItemActiveStatus(
        pendingStatus.ids,
        pendingStatus.isActive,
      );
      const label = pendingStatus.isActive
        ? "đang kinh doanh"
        : "ngừng kinh doanh";
      if (result.skipped.length === 0) {
        toast.success(`Đã chuyển ${result.updated} mặt hàng sang ${label}.`);
      } else {
        const codes = result.skipped
          .slice(0, 5)
          .map((s) => s.code)
          .join(", ");
        const more = result.skipped.length > 5 ? "…" : "";
        // updated === 0 is still a warning, never a success: nothing changed.
        toast.warning(
          `Đã chuyển ${result.updated} mặt hàng sang ${label}. ` +
            `${result.skipped.length} mặt hàng đang ở Showroom nên được bỏ qua (${codes}${more}). ` +
            `Hãy chuyển hàng khỏi Showroom trước.`,
        );
      }
      pendingStatus.context.refetchRecords();
      setPendingStatus(null);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Cập nhật trạng thái thất bại",
      );
    } finally {
      setApplying(false);
    }
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
        utilitiesOptions: canWrite
          ? [
              {
                id: "inventory-utilities-activate",
                label: "Đang kinh doanh",
                onSelect: askStatusChange(true),
              },
              {
                id: "inventory-utilities-deactivate",
                label: "Ngừng kinh doanh",
                onSelect: askStatusChange(false),
              },
            ]
          : undefined,
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
                includeInactive
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
            {pendingStatus ? (
              <Dialog
                open
                onOpenChange={(open) => {
                  if (!open && !applying) setPendingStatus(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {pendingStatus.isActive
                        ? "Chuyển sang Đang kinh doanh"
                        : "Chuyển sang Ngừng kinh doanh"}
                    </DialogTitle>
                    <DialogDescription>
                      {`Áp dụng cho ${pendingStatus.ids.length} dòng đã chọn, gồm tất cả biến thể bên trong. `}
                      {pendingStatus.isActive
                        ? "Hàng hoá sẽ được bán lại bình thường."
                        : "Mặt hàng đang còn ở kho Showroom sẽ được bỏ qua."}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      disabled={applying}
                      onClick={() => setPendingStatus(null)}
                    >
                      Huỷ
                    </Button>
                    <Button
                      disabled={applying}
                      onClick={() => void applyStatusChange()}
                    >
                      {applying ? "Đang cập nhật…" : "Xác nhận"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        ),
      }}
    />
  );
}
