import { useState } from "react";
import { PosDateRangeFilter } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter";
import type { PosDateRangeFilterOption } from "@erp/pos/lib/common/dateRangeFilter";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosDateRangeFilterDemo = () => {
  const [range, setRange] = useState<PosDateRangeFilterOption>("LAST_7_DAYS");

  return (
    <div className="flex flex-col items-start gap-2">
      <PosDateRangeFilter value={range} onChange={setRange} />
      <span className="text-[12px] text-gray-500">Đang chọn: {range}</span>
    </div>
  );
};

export const posDateRangeFilterEntry: CatalogEntry = {
  id: "pos-date-range-filter",
  name: "PosDateRangeFilter",
  category: "domain",
  importPath: "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeFilter",
  description:
    "Bộ lọc khoảng thời gian rời rạc (Hôm nay, 7 ngày, Tháng này…). Giữ lựa chọn tạm để xem trước rồi xác nhận bằng nút “Áp dụng”.",
  props: [
    { name: "value", type: "PosDateRangeFilterOption", required: true, description: "Khoảng đang chọn (vd \"ALL\", \"TODAY\", \"LAST_7_DAYS\"…)." },
    { name: "onChange", type: "(next: PosDateRangeFilterOption) => void", required: true, description: "Gọi khi bấm “Áp dụng” với khoảng mới." },
  ],
  usageNotes: [
    "onChange chỉ kích hoạt khi bấm “Áp dụng” — không phải mỗi lần chọn radio.",
    "Danh sách khoảng lấy từ DATE_RANGE_FILTER_CHOICES; lọc dữ liệu bằng isInDateRange().",
    "Khoảng \"OTHER\" để dành cho date-picker tuỳ chỉnh (chưa nối sẵn).",
  ],
  code: `const [range, setRange] = useState<PosDateRangeFilterOption>("ALL");

<PosDateRangeFilter value={range} onChange={setRange} />`,
  Demo: PosDateRangeFilterDemo,
};
