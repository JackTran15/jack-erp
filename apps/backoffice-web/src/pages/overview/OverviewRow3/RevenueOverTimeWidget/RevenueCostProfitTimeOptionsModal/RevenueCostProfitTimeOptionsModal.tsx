import { SingleSelect } from "@erp/ui";
import { useEffect, useMemo, useState } from "react";
import {
  REVENUE_COST_PROFIT_GRANULARITIES,
  granularityOptions,
  keepOrResetPeriod,
  revenueCostProfitPeriods,
  type Granularity,
} from "../../../_lib/granularity";
import { periodOptions, type OverviewPeriod } from "../../../_lib/period";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { OptionsRadioGroup } from "../../../WidgetOptionsModal/OptionsRadioGroup/OptionsRadioGroup";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

interface Props {
  open: boolean;
  granularity: Granularity;
  period: OverviewPeriod;
  onClose: () => void;
  onConfirm: (next: { granularity: Granularity; period: OverviewPeriod }) => void;
}

/**
 * Modal "Tùy chọn" của "Doanh thu, chi phí, lợi nhuận theo thời gian".
 * "Kỳ báo cáo" ở đây là NĂM (Năm 2026/2025/2024), khác hẳn các widget còn lại.
 */
export function RevenueCostProfitTimeOptionsModal({
  open,
  granularity,
  period,
  onClose,
  onConfirm,
}: Props) {
  const [draftGranularity, setDraftGranularity] = useState(granularity);
  const [draftPeriod, setDraftPeriod] = useState(period);

  // Danh sách năm tính theo năm hiện tại → cố định trong một lần mở modal.
  const periodsByGranularity = useMemo(() => revenueCostProfitPeriods(), []);

  useEffect(() => {
    if (!open) return;
    setDraftGranularity(granularity);
    setDraftPeriod(period);
  }, [open, granularity, period]);

  const allowedPeriods = periodsByGranularity[draftGranularity] ?? [];

  const changeGranularity = (next: Granularity) => {
    setDraftGranularity(next);
    setDraftPeriod((current) =>
      keepOrResetPeriod(current, periodsByGranularity[next] ?? []),
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
        <OptionsRadioGroup
          name="revenue-cost-profit-granularity"
          ariaLabel="Thống kê theo"
          value={draftGranularity}
          options={granularityOptions(REVENUE_COST_PROFIT_GRANULARITIES)}
          onChange={(v) => changeGranularity(v as Granularity)}
        />
      </OptionsFormRow>

      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(allowedPeriods)}
          value={draftPeriod}
          onValueChange={(v) => setDraftPeriod(v as OverviewPeriod)}
          searchable
          className={OVERVIEW_SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>
    </WidgetOptionsModal>
  );
}
