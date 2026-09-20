import { useState } from "react";
import { Button, PeriodFilter } from "@erp/ui";
import { Settings2 } from "lucide-react";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { OrdersColumnSettingsDialog } from "./OrdersColumnSettingsDialog/OrdersColumnSettingsDialog";
import { OrdersDateFieldSelect } from "./OrdersDateFieldSelect/OrdersDateFieldSelect";
import { OrdersTagFilterDialog } from "./OrdersTagFilterDialog/OrdersTagFilterDialog";

export function OrdersPageFilterBar() {
  const period = useOrdersStore((s) => s.period);
  const tagFilter = useOrdersStore((s) => s.tagFilter);
  const { setPeriod, applyFilter } = useOrdersActions();
  const [tagOpen, setTagOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <OrdersDateFieldSelect />
      <PeriodFilter value={period} onChange={setPeriod} onApply={applyFilter} />

      <Button type="button" variant="outline" size="sm" onClick={() => setTagOpen(true)}>
        {tagFilter.length > 0 ? `Lọc nhãn (${tagFilter.length})` : "Lọc nhãn"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="ml-auto h-8 w-8"
        aria-label="Cài đặt cột"
        onClick={() => setColumnsOpen(true)}
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      <OrdersTagFilterDialog open={tagOpen} onOpenChange={setTagOpen} />
      <OrdersColumnSettingsDialog open={columnsOpen} onOpenChange={setColumnsOpen} />
    </div>
  );
}
