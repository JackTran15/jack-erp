import {
  PRODUCT_TYPE_OPTIONS,
  ReportFilterOptionType,
  STAT_BY_OPTIONS,
  STAT_DATE_TYPE_OPTIONS,
  type ReportFilterOption,
} from "@erp/shared-interfaces";
import {
  REPORT_FILTERS_LINE,
  REPORT_FILTERS_LINE_METADATA,
} from "../../../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../../../store/page-stores/report/report.context";
import { ComboAllocationCheckbox } from "./ComboAllocationCheckbox/ComboAllocationCheckbox";
import { SourceStoreField } from "./SourceStoreField/SourceStoreField";
import { StoreScopeField } from "./StoreScopeField/StoreScopeField";
import { StoreSelectField } from "./StoreSelectField/StoreSelectField";
import { PeriodSelect } from "./PeriodSelect/PeriodSelect";
import { DateRangeField } from "./DateRangeField/DateRangeField";
import { StatisticByBranchCheckbox } from "./StatisticByBranchCheckbox/StatisticByBranchCheckbox";
import { InvoiceStatusMultiSelect } from "./InvoiceStatusMultiSelect/InvoiceStatusMultiSelect";
import { TreeSelectInput } from "../../../../../../../components/forms/TreeSelectInput";
import { RemoteSelectField } from "./RemoteSelectField/RemoteSelectField";
import { ReportSelectField } from "./ReportSelectField/ReportSelectField";
import { WarehouseSelectField } from "./WarehouseSelectField/WarehouseSelectField";
import { CustomerSearchSelectField } from "./CustomerSearchSelectField/CustomerSearchSelectField";
import { SupplierSearchSelectField } from "./SupplierSearchSelectField/SupplierSearchSelectField";
import { StoreInChainOptionalField } from "./StoreInChainOptionalField/StoreInChainOptionalField";

interface Props {
  line: REPORT_FILTERS_LINE;
}

// "Ca làm việc" — giá trị tĩnh (line hiện chưa bật cho report nào).
const WORK_SHIFT_OPTIONS: ReportFilterOption[] = [
  { value: "morning", label: "Ca sáng" },
  { value: "afternoon", label: "Ca chiều" },
];

// "Thống kê theo" (báo cáo #4) — Hàng hóa (theo SKU/biến thể) hoặc Mẫu mã (gộp
// theo sản phẩm cha), xem docs/24-debt-reports-spec.md #4.
const GROUP_BY_ITEM_OR_TEMPLATE_OPTIONS: ReportFilterOption[] = [
  { value: "item", label: "Hàng hóa" },
  { value: "productTemplate", label: "Mẫu mã" },
];

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function ReportFilterLine({ line }: Props) {
  const filters = useReportStore((s) => s.filters);
  const actions = useReportStore((s) => s.actions);

  const metadata = REPORT_FILTERS_LINE_METADATA[line] as {
    label?: string;
    isRequired?: boolean;
  };
  const label = capitalize(metadata?.label ?? "");

  function renderControl() {
    switch (line) {
      case REPORT_FILTERS_LINE.STORE:
        return (
          <StoreScopeField
            value={
              filters[REPORT_FILTERS_LINE.STORE] ?? { scope: "all", storeIds: [] }
            }
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.STORE, v)}
          />
        );
      case REPORT_FILTERS_LINE.INVOICE_STATUS:
        return (
          <InvoiceStatusMultiSelect
            value={filters[REPORT_FILTERS_LINE.INVOICE_STATUS] ?? []}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.INVOICE_STATUS, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.STAT_DATE_TYPE:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.STAT_DATE_TYPE] ?? ""}
            options={STAT_DATE_TYPE_OPTIONS}
            placeholder="— Chọn —"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.STAT_DATE_TYPE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.REPORT_PERIOD:
        return (
          <PeriodSelect
            value={filters[REPORT_FILTERS_LINE.REPORT_PERIOD] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.REPORT_PERIOD, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.RANGE_DATE:
        return (
          <DateRangeField
            value={
              filters[REPORT_FILTERS_LINE.RANGE_DATE] ?? {
                fromDate: "",
                toDate: "",
              }
            }
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.RANGE_DATE, v)
            }
          />
        );
      // "Kết quả kinh doanh" — 2 kỳ song song (kỳ trước/kỳ hiện tại), mỗi kỳ
      // tái dùng nguyên PeriodSelect + DateRangeField (2 dòng filter riêng,
      // giống hệt cặp REPORT_PERIOD/RANGE_DATE, chỉ khác nhãn). Xem TKT-PRF-10.
      case REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS:
        return (
          <PeriodSelect
            value={filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE:
        return (
          <DateRangeField
            value={
              filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE] ?? {
                fromDate: "",
                toDate: "",
              }
            }
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE,
                v,
              )
            }
          />
        );
      case REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT:
        return (
          <PeriodSelect
            value={filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE:
        return (
          <DateRangeField
            value={
              filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE] ?? {
                fromDate: "",
                toDate: "",
              }
            }
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE,
                v,
              )
            }
          />
        );
      case REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND:
        return (
          <StatisticByBranchCheckbox
            value={
              filters[REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND] ?? false
            }
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND,
                v,
              )
            }
          />
        );
      case REPORT_FILTERS_LINE.CASHIER:
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.CASHIER}
            value={filters[REPORT_FILTERS_LINE.CASHIER] ?? ""}
            placeholder="Tất cả"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.CASHIER, v)}
          />
        );
      case REPORT_FILTERS_LINE.SALESPERSON:
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.SALESPERSON}
            value={filters[REPORT_FILTERS_LINE.SALESPERSON] ?? ""}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.SALESPERSON, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.CUSTOMER:
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.CUSTOMER}
            value={filters[REPORT_FILTERS_LINE.CUSTOMER] ?? ""}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.CUSTOMER, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.CUSTOMER_SEARCH:
        return (
          <CustomerSearchSelectField
            value={filters[REPORT_FILTERS_LINE.CUSTOMER_SEARCH] ?? null}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.CUSTOMER_SEARCH, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.SUPPLIER:
        return (
          <SupplierSearchSelectField
            value={filters[REPORT_FILTERS_LINE.SUPPLIER] ?? null}
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.SUPPLIER, v)}
          />
        );
      case REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL:
        return (
          <StoreInChainOptionalField
            value={filters[REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE:
        return (
          <ReportSelectField
            value={
              filters[REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE] ?? "item"
            }
            options={GROUP_BY_ITEM_OR_TEMPLATE_OPTIONS}
            hidePlaceholder
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE,
                v,
              )
            }
          />
        );
      case REPORT_FILTERS_LINE.WAREHOUSE:
        return (
          <WarehouseSelectField
            value={filters[REPORT_FILTERS_LINE.WAREHOUSE] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.WAREHOUSE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.PRODUCT_GROUP:
        // Select nhóm hàng hóa dùng chung, có phân cấp cha/con (rỗng = tất cả nhóm).
        return (
          <TreeSelectInput
            value={filters[REPORT_FILTERS_LINE.PRODUCT_GROUP] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PRODUCT_GROUP, v)
            }
            entityKey="inventory-item-categories"
            placeholder="Tất cả nhóm"
            allOptionLabel="Tất cả nhóm"
            inputClassName="h-9 text-xs"
          />
        );
      case REPORT_FILTERS_LINE.PRODUCT_TYPE:
        // Có default ("product") → không cần option placeholder (tránh trùng "Hàng hóa").
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.PRODUCT_TYPE] ?? "product"}
            options={PRODUCT_TYPE_OPTIONS}
            hidePlaceholder
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PRODUCT_TYPE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.STATISTIC_BY:
        // Có default ("item") → không cần option placeholder (tránh trùng "Hàng hóa").
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.STATISTIC_BY] ?? "item"}
            options={STAT_BY_OPTIONS}
            hidePlaceholder
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.STATISTIC_BY, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.UNIT:
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.UNIT}
            value={filters[REPORT_FILTERS_LINE.UNIT] ?? ""}
            placeholder="Tất cả ĐVT"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.UNIT, v)}
          />
        );
      case REPORT_FILTERS_LINE.BRAND:
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.BRAND}
            value={filters[REPORT_FILTERS_LINE.BRAND] ?? ""}
            placeholder="Tất cả"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.BRAND, v)}
          />
        );
      case REPORT_FILTERS_LINE.WORK_SHIFT:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.WORK_SHIFT] ?? ""}
            options={WORK_SHIFT_OPTIONS}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.WORK_SHIFT, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO:
        return (
          <ComboAllocationCheckbox
            value={filters[REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO] ?? false}
            onChange={(v) =>
              actions.setFilterValue(
                REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO,
                v,
              )
            }
          />
        );
      case REPORT_FILTERS_LINE.STORE_SINGLE:
        return (
          <StoreSelectField
            value={filters[REPORT_FILTERS_LINE.STORE_SINGLE] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.STORE_SINGLE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.SOURCE_STORE:
        return (
          <SourceStoreField
            value={filters[REPORT_FILTERS_LINE.SOURCE_STORE] ?? ""}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.SOURCE_STORE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.RECEIVING_STORE: {
        const sourceStore = filters[REPORT_FILTERS_LINE.SOURCE_STORE];
        return (
          <RemoteSelectField
            type={ReportFilterOptionType.STORE}
            value={filters[REPORT_FILTERS_LINE.RECEIVING_STORE] ?? ""}
            placeholder="Tất cả"
            excludeValues={sourceStore ? [sourceStore] : undefined}
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.RECEIVING_STORE, v)
            }
          />
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="w-[110px] shrink-0 pt-1.5 text-xs text-muted-foreground">
        {label}
        {metadata?.isRequired ? <span className="text-destructive"> *</span> : null}
      </div>
      <div className="min-w-0 flex-1">{renderControl()}</div>
    </div>
  );
}
