import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, SingleSelect } from "@erp/ui";
import { X } from "lucide-react";
import { useState } from "react";
import { ORDER_TAGS } from "../../../../store/page-stores/orders/orders.constant";
import { setOrderTags, type OrderRow } from "../../_mock/orders.mock";

interface Props {
  order: OrderRow | null;
}

/**
 * Tab "Nhãn" — spec không có ảnh cho tab này; dựng bản tối thiểu: xem, gỡ và
 * gắn nhãn cho đơn đang focus.
 */
export function OrdersDetailTagsPanel({ order }: Props) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState("");

  if (!order) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Chọn một đơn hàng để xem nhãn.
      </div>
    );
  }

  const available = ORDER_TAGS.filter((tag) => !order.tags.includes(tag));

  const commit = (tags: string[]) => {
    setOrderTags(order.id, tags);
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {order.tags.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            Đơn hàng này chưa có nhãn.
          </span>
        ) : (
          order.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 rounded-sm font-normal">
              {tag}
              <button
                type="button"
                aria-label={`Gỡ nhãn ${tag}`}
                onClick={() => commit(order.tags.filter((item) => item !== tag))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <SingleSelect
            options={available.map((tag) => ({ value: tag, label: tag }))}
            value={pending}
            onValueChange={setPending}
            placeholder="Chọn nhãn…"
            className="h-8 w-48 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!pending}
            onClick={() => {
              commit([...order.tags, pending]);
              setPending("");
            }}
          >
            Thêm nhãn
          </Button>
        </div>
      ) : null}
    </div>
  );
}
