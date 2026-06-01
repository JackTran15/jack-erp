import { toast } from "sonner";
import type { ToolbarActionOption } from "@erp/ui";
import { TOOLBAR_ACTION } from "../../constants";
import type { ListToolbarSpec } from "./build-toolbar";

export interface CrudListToolbarContext {
  handleCreate: () => void;
  openDuplicateDialog: () => void;
  handleEdit: () => void;
  handleDeleteSelected: () => void;
  refetchRecords: () => void;
  navigate: (to: string) => void;
  onImportInventory?: () => void;
  onExportInventory?: () => void;
  onExportInventoryAll?: () => void;
  onExportInventorySelected?: () => void;
  exportInventoryOptions?: ToolbarActionOption[];
}

export interface CrudListToolbarSelection {
  selectedRecord: Record<string, unknown> | null;
  selectedCount: number;
}

const soon = (message: string) => () => toast.info(message);

const baseCrud = (ctx: CrudListToolbarContext, sel: CrudListToolbarSelection): ListToolbarSpec[] => [
  { action: TOOLBAR_ACTION.create, onClick: ctx.handleCreate },
  {
    action: TOOLBAR_ACTION.duplicate,
    onClick: ctx.openDuplicateDialog,
    disabled: !sel.selectedRecord,
  },
  {
    action: TOOLBAR_ACTION.edit,
    onClick: ctx.handleEdit,
    disabled: !sel.selectedRecord,
  },
  {
    action: TOOLBAR_ACTION.delete,
    onClick: ctx.handleDeleteSelected,
    disabled: sel.selectedCount === 0,
  },
];

const refresh = (ctx: CrudListToolbarContext): ListToolbarSpec => ({
  action: TOOLBAR_ACTION.refresh,
  onClick: () => void ctx.refetchRecords(),
});

const importExport = (ctx: CrudListToolbarContext): ListToolbarSpec[] => [
  {
    action: TOOLBAR_ACTION.import,
    onClick:
      ctx.onImportInventory ?? soon("Tính năng nhập khẩu đang được triển khai."),
  },
  {
    action: TOOLBAR_ACTION.export,
    onClick:
      ctx.onExportInventoryAll ??
      ctx.onExportInventory ??
      soon("Tính năng xuất khẩu đang được triển khai."),
    options: ctx.exportInventoryOptions,
  },
];

/**
 * Thanh công cụ danh sách CRUD theo từng `entityKey` (đường dẫn `/admin/:entityKey`).
 */
export function buildCrudEntityToolbarSpecs(
  entityKey: string,
  ctx: CrudListToolbarContext,
  sel: CrudListToolbarSelection,
): ListToolbarSpec[] {
  switch (entityKey) {
    case "inventory-items":
      return [
        ...baseCrud(ctx, sel),
        {
          action: TOOLBAR_ACTION.printLabel,
          onClick: () => ctx.navigate("/admin/inventory-item-barcodes"),
        },
        {
          action: TOOLBAR_ACTION.utilities,
          onClick: soon("Tiện ích đang được triển khai."),
        },
        ...importExport(ctx),
        {
          action: TOOLBAR_ACTION.stockoutStatus,
          onClick: soon("Trạng thái hết hàng đang được triển khai."),
        },
      ];

    case "inventory-providers":
      return [
        ...baseCrud(ctx, sel),
        refresh(ctx),
        {
          action: TOOLBAR_ACTION.transactionHistory,
          onClick: soon("Xem lịch sử giao dịch đang được triển khai."),
        },
        ...importExport(ctx),
      ];

    case "inventory-stock-balances":
      return [...baseCrud(ctx, sel), refresh(ctx)];

    case "customers":
      return [...baseCrud(ctx, sel), refresh(ctx), ...importExport(ctx)];

    default:
      return baseCrud(ctx, sel);
  }
}
