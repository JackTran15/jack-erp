import { SingleSelect } from "@erp/ui";
import { ORDER_DATE_FIELD_OPTIONS } from "../../../../store/page-stores/orders/orders.constant";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../../store/page-stores/orders/orders.store";
import type { OrderDateField } from "../../_lib/order-filter";

/** Chọn trường ngày mà bộ lọc kỳ áp lên (spec 4.2.A). */
export function OrdersDateFieldSelect() {
  const dateField = useOrdersStore((s) => s.dateField);
  const { setDateField } = useOrdersActions();

  return (
    <SingleSelect
      options={ORDER_DATE_FIELD_OPTIONS}
      value={dateField}
      onValueChange={(value) => setDateField(value as OrderDateField)}
      className="h-8 w-36 text-sm"
    />
  );
}
