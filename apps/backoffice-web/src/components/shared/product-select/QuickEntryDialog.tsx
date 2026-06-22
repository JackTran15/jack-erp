import { AppModal, Button, MoneyInput } from "@erp/ui";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apply quantity + unit price to all currently selected items. */
  onApply: (quantity: number, unitPrice: number) => void;
  /** Header title. Defaults to the global "all items" wording. */
  title?: string;
}

export function QuickEntryDialog({
  open,
  onOpenChange,
  onApply,
  title = "Nhập nhanh cho tất cả hàng hoá",
}: Props) {
  const [quantity, setQuantity] = useState<number | "">(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");

  function handleApply() {
    onApply(quantity === "" ? 0 : quantity, unitPrice === "" ? 0 : unitPrice);
    onOpenChange(false);
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      preventOutsideClose
      title={title}
      description={null}
      defaultWidth={420}
      defaultHeight={240}
      minWidth={360}
      minHeight={200}
      bodyClassName="flex flex-col gap-3"
      showFooter
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy bỏ
          </Button>
          <Button onClick={handleApply}>Đồng ý</Button>
        </div>
      }
    >
      <label className="flex items-center gap-3 text-sm">
        <span className="w-20 shrink-0 text-muted-foreground">Số lượng</span>
        <MoneyInput
          value={quantity}
          onChange={setQuantity}
          className="h-9 flex-1"
          autoFocus
        />
      </label>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-20 shrink-0 text-muted-foreground">Đơn giá</span>
        <MoneyInput
          value={unitPrice}
          onChange={setUnitPrice}
          onKeyDown={(e) => { if (e.key === "Enter") handleApply(); }}
          className="h-9 flex-1"
        />
      </label>
    </AppModal>
  );
}
