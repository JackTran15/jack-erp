import {
  CASH_FUND_TIME_BUCKETS,
  CASH_FUND_TIME_BUCKET_LABELS_VI,
  type CashFundTimeBucket,
} from "@erp/shared-interfaces";
import { ReportSelectField } from "../ReportSelectField/ReportSelectField";

interface Props {
  value: CashFundTimeBucket;
  onChange: (value: CashFundTimeBucket) => void;
}

// "Thống kê theo" của "Chi tiền theo thời gian" — select tĩnh Ngày / Tuần /
// Tháng / Quý / Năm (A-13). Luôn có giá trị (mặc định "day") nên không có
// option "Tất cả".
const TIME_BUCKET_OPTIONS = CASH_FUND_TIME_BUCKETS.map((bucket) => ({
  value: bucket,
  label: CASH_FUND_TIME_BUCKET_LABELS_VI[bucket],
}));

export function TimeBucketField({ value, onChange }: Props) {
  return (
    <ReportSelectField
      value={value}
      options={TIME_BUCKET_OPTIONS}
      hidePlaceholder
      onChange={(v) => onChange(v as CashFundTimeBucket)}
    />
  );
}
