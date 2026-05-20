import type {
  CatalogCategory,
  CatalogEntry,
} from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";
import { posTextInputEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosTextInputDemo/PosTextInputDemo";
import { posNumberInputEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosNumberInputDemo/PosNumberInputDemo";
import { posQuantityInputEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosQuantityInputDemo/PosQuantityInputDemo";
import { posTextareaEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosTextareaDemo/PosTextareaDemo";
import { posCheckboxEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosCheckboxDemo/PosCheckboxDemo";
import { posRadioEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosRadioDemo/PosRadioDemo";
import { posRadioGroupEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosRadioGroupDemo/PosRadioGroupDemo";
import { posToggleEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosToggleDemo/PosToggleDemo";
import { posToggleFieldEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosToggleFieldDemo/PosToggleFieldDemo";
import { posSelectEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosSelectDemo/PosSelectDemo";
import { posSelectSearchEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosSelectSearchDemo/PosSelectSearchDemo";
import { posSearchPopoverEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosSearchPopoverDemo/PosSearchPopoverDemo";
import { posFormItemEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosFormItemDemo/PosFormItemDemo";
import { posDataTableEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosDataTableDemo/PosDataTableDemo";
import { posSummaryRowEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosSummaryRowDemo/PosSummaryRowDemo";
import { posSectionBannerEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosSectionBannerDemo/PosSectionBannerDemo";
import { posPaginationBarEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosPaginationBarDemo/PosPaginationBarDemo";
import { posIconsEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosIconsDemo/PosIconsDemo";
import { posIconButtonEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosIconButtonDemo/PosIconButtonDemo";
import { posDialogEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosDialogDemo/PosDialogDemo";
import { posErrorDialogEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosErrorDialogDemo/PosErrorDialogDemo";
import { posVietQrPaymentDialogEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosVietQrPaymentDialogDemo/PosVietQrPaymentDialogDemo";
import { posCustomerActionsEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosCustomerActionsDemo/PosCustomerActionsDemo";
import { posPaymentMethodRowEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosPaymentMethodRowDemo/PosPaymentMethodRowDemo";
import { posDateRangeFilterEntry } from "@erp/pos/components/page-components/UiCatalog/demos/PosDateRangeFilterDemo/PosDateRangeFilterDemo";

/** Nhãn tiếng Việt cho từng nhóm. */
export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  input: "Nhập liệu",
  display: "Hiển thị",
  overlay: "Hộp thoại",
  domain: "Nghiệp vụ",
};

/** Thứ tự hiển thị các nhóm trong gallery và tab. */
export const CATEGORY_ORDER: CatalogCategory[] = [
  "input",
  "display",
  "overlay",
  "domain",
];

/** Toàn bộ entry common component hiển thị trên trang `/ui`. */
export const UI_CATALOG_ENTRIES: CatalogEntry[] = [
  // Nhập liệu
  posTextInputEntry,
  posNumberInputEntry,
  posQuantityInputEntry,
  posTextareaEntry,
  posCheckboxEntry,
  posRadioEntry,
  posRadioGroupEntry,
  posToggleEntry,
  posToggleFieldEntry,
  posSelectEntry,
  posSelectSearchEntry,
  posSearchPopoverEntry,
  posFormItemEntry,
  // Hiển thị
  posDataTableEntry,
  posSummaryRowEntry,
  posSectionBannerEntry,
  posPaginationBarEntry,
  posIconsEntry,
  posIconButtonEntry,
  // Hộp thoại
  posDialogEntry,
  posErrorDialogEntry,
  posVietQrPaymentDialogEntry,
  // Nghiệp vụ
  posCustomerActionsEntry,
  posPaymentMethodRowEntry,
  posDateRangeFilterEntry,
];
