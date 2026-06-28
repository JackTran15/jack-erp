import { useState } from "react";
import { AppModal, Button, FormField } from "@erp/ui";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { todayIsoDate } from "./cash-count.utils";

interface Props {
  onClose: () => void;
  onPicked: (inventoryUntilDate: string) => void;
}

export function CreateCashCountDialog({ onClose, onPicked }: Props) {
  const [inventoryUntilDate, setInventoryUntilDate] = useState(todayIsoDate());

  const handleSubmit = () => {
    if (!inventoryUntilDate) {
      toast.error("Vui lòng chọn ngày kiểm kê đến.");
      return;
    }
    onPicked(inventoryUntilDate);
  };

  return (
    <AppModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Kiểm kê tiền mặt"
      className="max-w-[520px]"
      defaultHeight={180}
      bodyStretch={false}
      showFooter
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" onClick={handleSubmit}>
            Kiểm kê tiền mặt
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy bỏ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-1">
        <FormField label="Kiểm kê đến ngày" required>
          <input
            type="date"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={inventoryUntilDate}
            onChange={(e) => setInventoryUntilDate(e.target.value)}
            autoFocus
          />
        </FormField>
      </div>
    </AppModal>
  );
}
