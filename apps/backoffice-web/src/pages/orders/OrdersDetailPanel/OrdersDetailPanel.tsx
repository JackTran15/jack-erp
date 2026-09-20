import { Tabs } from "../../../components/tabs/Tabs";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import type { OrdersDetailTab } from "../../../store/page-stores/orders/orders.interface";
import type { OrderLineRow, OrderRow } from "../_mock/orders.mock";
import { OrdersDetailLinesTable } from "./OrdersDetailLinesTable/OrdersDetailLinesTable";
import { OrdersDetailTagsPanel } from "./OrdersDetailTagsPanel/OrdersDetailTagsPanel";

interface Props {
  order: OrderRow | null;
  lines: OrderLineRow[];
  loading: boolean;
}

const TABS: readonly { id: OrdersDetailTab; label: string }[] = [
  { id: "detail", label: "Chi tiết" },
  { id: "tags", label: "Nhãn" },
];

export function OrdersDetailPanel({ order, lines, loading }: Props) {
  const detailTab = useOrdersStore((s) => s.detailTab);
  const { setDetailTab } = useOrdersActions();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs tabs={TABS} activeTab={detailTab} onTabChange={setDetailTab} />
      {detailTab === "detail" ? (
        <OrdersDetailLinesTable
          lines={lines}
          loading={loading}
          hasFocusedOrder={Boolean(order)}
        />
      ) : (
        <OrdersDetailTagsPanel order={order} />
      )}
    </div>
  );
}
