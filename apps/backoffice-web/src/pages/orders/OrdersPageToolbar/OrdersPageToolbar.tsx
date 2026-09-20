import { useState } from "react";
import { PageToolbar, type ToolbarItem } from "@erp/ui";
import { ArrowLeftRight, Plus, RefreshCw } from "lucide-react";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { OrdersReconcileDialog } from "./OrdersReconcileDialog/OrdersReconcileDialog";

export function OrdersPageToolbar() {
  const checkedOrderIds = useOrdersStore((s) => s.checkedOrderIds);
  const { reload } = useOrdersActions();
  const [reconcileOpen, setReconcileOpen] = useState(false);

  const items: ToolbarItem[] = [
    {
      id: "stats-items",
      label: "Thống kê hàng hóa",
      icon: Plus,
      onClick: () => undefined,
      disabled: true,
      tooltip: "Chưa hỗ trợ",
    },
    {
      id: "stats-orders",
      label: "Thống kê theo đơn hàng",
      icon: Plus,
      onClick: () => undefined,
      disabled: true,
      tooltip: "Chưa hỗ trợ",
    },
    { id: "sep-1", type: "separator" },
    {
      id: "reconcile",
      label: "Đối soát",
      icon: ArrowLeftRight,
      onClick: () => setReconcileOpen(true),
      disabled: checkedOrderIds.length === 0,
      tooltip: "Chọn ít nhất một đơn hàng để đối soát",
    },
    { id: "sep-2", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: reload },
  ];

  return (
    <>
      <PageToolbar items={items} tone="primary" className="m-2 rounded-md" />
      <OrdersReconcileDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
      />
    </>
  );
}
