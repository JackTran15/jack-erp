import { useEffect, useState } from "react";
import { AppModal, Badge } from "@erp/ui";
import { ORDER_TAGS } from "../../../../store/page-stores/orders/orders.constant";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../../store/page-stores/orders/orders.store";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Chọn nhãn để lọc. Ghi vào `tagFilter` (bộ lọc đang soạn), nên chỉ có hiệu lực
 * sau khi bấm "Lấy dữ liệu" — cùng ngữ nghĩa với kỳ và trường ngày.
 */
export function OrdersTagFilterDialog({ open, onOpenChange }: Props) {
  const tagFilter = useOrdersStore((s) => s.tagFilter);
  const { setTagFilter } = useOrdersActions();
  const [draft, setDraft] = useState<string[]>(tagFilter);

  // Mở lại dialog thì bắt đầu từ lựa chọn đang áp, không phải bản nháp cũ.
  useEffect(() => {
    if (open) setDraft(tagFilter);
  }, [open, tagFilter]);

  const toggle = (tag: string) =>
    setDraft((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Lọc nhãn"
      description="Chỉ hiển thị đơn hàng có ít nhất một trong các nhãn đã chọn."
      saveLabel="Áp dụng"
      cancelLabel="Đóng"
      onSave={() => {
        setTagFilter(draft);
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
      defaultWidth={420}
      bodyStretch={false}
      autoHeight
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="self-start text-sm text-primary-blue hover:underline"
          onClick={() => setDraft(draft.length === ORDER_TAGS.length ? [] : [...ORDER_TAGS])}
        >
          {draft.length === ORDER_TAGS.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </button>
        {ORDER_TAGS.map((tag) => (
          <label key={tag} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.includes(tag)}
              onChange={() => toggle(tag)}
            />
            <Badge variant="secondary" className="rounded-sm font-normal">
              {tag}
            </Badge>
          </label>
        ))}
      </div>
    </AppModal>
  );
}
