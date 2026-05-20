import { formatVnd } from "@erp/ui";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosSummaryRowDemo = () => {
  return (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <PosSummaryRow label="Tổng tiền hàng" value={formatVnd(185000)} />
      <PosSummaryRow label="Đặt cọc" value={formatVnd(50000)} emphasis="strong" />
      <PosSummaryRow label="Còn phải thu" value={formatVnd(135000)} emphasis="xl" />
    </div>
  );
};

export const posSummaryRowEntry: CatalogEntry = {
  id: "pos-summary-row",
  name: "PosSummaryRow",
  category: "display",
  importPath: "@erp/pos/components/common/PosSummaryRow/PosSummaryRow",
  description:
    "Dòng “nhãn · giá trị” cho bảng tổng kết thanh toán, với 3 mức nhấn mạnh (default, strong, xl).",
  props: [
    { name: "label", type: "ReactNode", required: true, description: "Nhãn bên trái." },
    { name: "value", type: "ReactNode", required: true, description: "Giá trị bên phải." },
    { name: "emphasis", type: '"default" | "strong" | "xl"', required: false, defaultValue: '"default"', description: "Mức nhấn mạnh của giá trị." },
    { name: "className", type: "string", required: false, description: "Class bổ sung." },
  ],
  usageNotes: [
    "Dùng emphasis=\"xl\" cho dòng quan trọng nhất (vd “Còn phải thu”).",
    "Định dạng tiền bằng formatVnd từ @erp/ui.",
  ],
  code: `<PosSummaryRow label="Tổng tiền hàng" value={formatVnd(185000)} />
<PosSummaryRow label="Còn phải thu" value={formatVnd(135000)} emphasis="xl" />`,
  Demo: PosSummaryRowDemo,
};
