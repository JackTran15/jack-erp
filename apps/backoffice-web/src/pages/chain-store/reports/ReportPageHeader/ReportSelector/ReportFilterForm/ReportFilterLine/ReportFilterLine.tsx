import {
  REPORT_FILTERS_LINE,
  REPORT_FILTERS_LINE_METADATA,
} from "../../../../../../../constants/reports/report-filters.constant";
import { useReportStore } from "../../../../../../../store/page-stores/report/report.context";
import {
  statDateTypeOptions,
  cashierOptions,
  salespersonOptions,
  customerOptions,
} from "../../_mock/report-invoice-filter.mock";
import {
  warehouseOptions,
  productGroupOptions,
  productTypeOptions,
  statisticByOptions,
  unitOptions,
  brandOptions,
  workShiftOptions,
  receivingStoreOptions,
} from "../../_mock/report-inventory-filter.mock";
import { ComboAllocationCheckbox } from "./ComboAllocationCheckbox/ComboAllocationCheckbox";
import { SourceStoreField } from "./SourceStoreField/SourceStoreField";
import { StoreScopeField } from "./StoreScopeField/StoreScopeField";
import { StoreSelectField } from "./StoreSelectField/StoreSelectField";
import { PeriodSelect } from "./PeriodSelect/PeriodSelect";
import { DateRangeField } from "./DateRangeField/DateRangeField";
import { StatisticByBranchCheckbox } from "./StatisticByBranchCheckbox/StatisticByBranchCheckbox";
import { InvoiceStatusMultiSelect } from "./InvoiceStatusMultiSelect/InvoiceStatusMultiSelect";
import { ReportSelectField } from "./ReportSelectField/ReportSelectField";

interface Props {
  line: REPORT_FILTERS_LINE;
}

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
            options={statDateTypeOptions}
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
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.CASHIER] ?? ""}
            options={cashierOptions}
            placeholder="Tất cả"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.CASHIER, v)}
          />
        );
      case REPORT_FILTERS_LINE.SALESPERSON:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.SALESPERSON] ?? ""}
            options={salespersonOptions}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.SALESPERSON, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.CUSTOMER:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.CUSTOMER] ?? ""}
            options={customerOptions}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.CUSTOMER, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.WAREHOUSE:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.WAREHOUSE] ?? ""}
            options={warehouseOptions}
            placeholder="Tất cả kho"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.WAREHOUSE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.PRODUCT_GROUP:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.PRODUCT_GROUP] ?? ""}
            options={productGroupOptions}
            placeholder="Tất cả nhóm"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PRODUCT_GROUP, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.PRODUCT_TYPE:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.PRODUCT_TYPE] ?? "product"}
            options={productTypeOptions}
            placeholder="Hàng hóa"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.PRODUCT_TYPE, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.STATISTIC_BY:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.STATISTIC_BY] ?? "item"}
            options={statisticByOptions}
            placeholder="Hàng hóa"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.STATISTIC_BY, v)
            }
          />
        );
      case REPORT_FILTERS_LINE.UNIT:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.UNIT] ?? ""}
            options={unitOptions}
            placeholder="Tất cả ĐVT"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.UNIT, v)}
          />
        );
      case REPORT_FILTERS_LINE.BRAND:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.BRAND] ?? ""}
            options={brandOptions}
            placeholder="Tất cả"
            onChange={(v) => actions.setFilterValue(REPORT_FILTERS_LINE.BRAND, v)}
          />
        );
      case REPORT_FILTERS_LINE.WORK_SHIFT:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.WORK_SHIFT] ?? ""}
            options={workShiftOptions}
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
        return <SourceStoreField />;
      case REPORT_FILTERS_LINE.RECEIVING_STORE:
        return (
          <ReportSelectField
            value={filters[REPORT_FILTERS_LINE.RECEIVING_STORE] ?? ""}
            options={receivingStoreOptions}
            placeholder="Tất cả"
            onChange={(v) =>
              actions.setFilterValue(REPORT_FILTERS_LINE.RECEIVING_STORE, v)
            }
          />
        );
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
