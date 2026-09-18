import { SingleSelect } from "@erp/ui";
import { useEffect, useState } from "react";
import {
  REVENUE_OVER_TIME_GRANULARITIES,
  REVENUE_OVER_TIME_PERIODS,
  granularityOptions,
  keepOrResetPeriod,
  type Granularity,
} from "../../../_lib/granularity";
import { periodOptions, type OverviewPeriod } from "../../../_lib/period";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";

const SELECT_CLASS = "h-9 rounded-sm border-[#BDBDBD] px-2 text-[13px]";

interface Props {
  open: boolean;
  granularity: Granularity;
  period: OverviewPeriod;
  onClose: () => void;
  onConfirm: (next: { granularity: Granularity; period: OverviewPeriod }) => void;
}

/**
 * Modal "Tùy chọn" của "Doanh thu theo thời gian".
 * Khác row 2: "Thống kê theo" là SELECT với đủ 7 giá trị, không phải radio.
 */
export function RevenueOverTimeOptionsModal({
  open,
  granularity,
  period,
  onClose,
  onConfirm,
}: Props) {
  const [draftGranularity, setDraftGranularity] = useState(granularity);
  const [draftPeriod, setDraftPeriod] = useState(period);

  useEffect(() => {
    if (!open) return;
    setDraftGranularity(granularity);
    setDraftPeriod(period);
  }, [open, granularity, period]);

  const allowedPeriods = REVENUE_OVER_TIME_PERIODS[draftGranularity] ?? [];

  const changeGranularity = (next: Granularity) => {
    setDraftGranularity(next);
    setDraftPeriod((current) =>
      keepOrResetPeriod(current, REVENUE_OVER_TIME_PERIODS[next] ?? []),
    );
  };

  return (
    <WidgetOptionsModal
      open={open}
      width={400}
      // 2 dòng
      height={237}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({ granularity: draftGranularity, period: draftPeriod })
      }
    >
      <OptionsFormRow label="Thống kê theo">
        <SingleSelect
          options={granularityOptions(REVENUE_OVER_TIME_GRANULARITIES)}
          value={draftGranularity}
          onValueChange={(v) => changeGranularity(v as Granularity)}
          searchable
          className={SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>

      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(allowedPeriods)}
          value={draftPeriod}
          onValueChange={(v) => setDraftPeriod(v as OverviewPeriod)}
          searchable
          className={SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>
    </WidgetOptionsModal>
  );
}
