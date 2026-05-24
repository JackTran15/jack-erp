import { PosSectionBanner } from "@erp/pos/components/common/PosSectionBanner/PosSectionBanner";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export const PosSectionBannerDemo = () => {
  return (
    <div className="w-full max-w-sm">
      <PosSectionBanner>Thông tin cơ bản</PosSectionBanner>
      <p className="px-1 py-2 text-[13px] text-gray-500">
        Các trường nhập liệu của nhóm này…
      </p>
      <PosSectionBanner>Thông tin thẻ thành viên</PosSectionBanner>
    </div>
  );
};

export const posSectionBannerEntry: CatalogEntry = {
  id: "pos-section-banner",
  name: "PosSectionBanner",
  category: "display",
  importPath: "@erp/pos/components/common/PosSectionBanner/PosSectionBanner",
  description:
    "Dải tiêu đề nền xám nhạt để ngăn cách các nhóm trường trong form.",
  props: [
    { name: "children", type: "ReactNode", required: true, description: "Nội dung tiêu đề nhóm." },
    { name: "className", type: "string", required: false, description: "Class bổ sung." },
  ],
  usageNotes: [
    "Đặt giữa các nhóm trường để chia phần (vd “Thông tin cơ bản”, “Thông tin công ty”).",
  ],
  code: `<PosSectionBanner>Thông tin cơ bản</PosSectionBanner>`,
  Demo: PosSectionBannerDemo,
};
