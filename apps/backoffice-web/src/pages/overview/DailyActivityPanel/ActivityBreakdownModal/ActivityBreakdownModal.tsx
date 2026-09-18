import { AppModal } from "@erp/ui";
import type { BreakdownItem } from "../../_mock/dailyActivity.mock";
import { BreakdownRow } from "./BreakdownRow/BreakdownRow";

interface Props {
  open: boolean;
  title: string;
  /** Luôn bằng con số trên dòng vừa bấm ở row 1. */
  total: number;
  items: BreakdownItem[];
  onClose: () => void;
}

/**
 * 40 (thanh tiêu đề) + 8 (padding body còn lại) + 40 (dòng Tổng) + 36 mỗi dòng
 * con, cộng 8px dư.
 *
 * `py-4` của AppModal (16px trên + 16px dưới) đã bị `-mt-4 -mb-2` khử còn 8px ở
 * đáy — con số 8 ở đây phải khớp với hai class đó, đổi bên nào thì sửa bên kia.
 * 8px dư cuối cùng để chiều cao không khớp nội dung đúng 0px, tránh sinh thanh
 * cuộn dọc vì lệch subpixel.
 */
function modalHeight(rowCount: number): number {
  return 40 + 8 + 40 + rowCount * 36 + 8;
}

/**
 * Modal chi tiết dùng chung cho cả 9 điểm bấm của row 1. Hai biến thể do dữ liệu
 * quyết định: có `count` thì dòng chia 3 cột kèm badge, không thì 2 cột.
 */
export function ActivityBreakdownModal({ open, title, total, items, onClose }: Props) {
  const withCount = items.some((item) => item.count !== undefined);
  // Nhãn dài nhất quyết định cột badge, để badge thẳng cột trong cùng modal.
  const labelWidth = items.some((item) => item.label.length > 15) ? 124 : 120;

  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      defaultWidth={withCount ? 480 : 420}
      defaultHeight={modalHeight(items.length)}
      // Thấp hơn modal nhỏ nhất (1 dòng = 148) để không bị kẹp lên mặc định 220.
      minHeight={120}
      minWidth={320}
      bodyStretch={false}
      showFooter={false}
      // `-mx-4` phải nằm trên CHÍNH vùng cuộn, không phải trên div con: đây là
      // nơi `overflow` cắt, nên đặt ở con thì phần thò ra 16px bị xén mất (nuốt
      // luôn nửa chữ đầu của "Tổng"). Đặt ở đây thì biên cắt dịch ra theo, và
      // dòng chạy sát mép modal đúng như spec.
      // `-mt-4` khử hết padding trên để dòng "Tổng" nằm sát divider của header
      // như spec; `-mb-2` để lại 8px dưới đáy.
      bodyClassName="-mx-4 -mb-2 -mt-4 overflow-y-auto overflow-x-hidden"
    >
      <div className="flex flex-col">
        <BreakdownRow label="Tổng" value={total} isTotal labelWidth={labelWidth} />
        {items.map((item) => (
          <BreakdownRow
            key={item.key}
            label={item.label}
            value={item.value}
            count={item.count}
            danger={item.danger}
            labelWidth={labelWidth}
          />
        ))}
      </div>
    </AppModal>
  );
}
