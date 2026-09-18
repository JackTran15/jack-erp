import { SingleSelect } from "@erp/ui";
import { useEffect, useState } from "react";
import {
  CASH_FLOW_GRANULARITIES,
  CASH_FLOW_PERIODS,
  granularityOptions,
  keepOrResetPeriod,
  type Granularity,
} from "../../../_lib/granularity";
import { periodOptions, type OverviewPeriod } from "../../../_lib/period";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { OptionsRadioGroup } from "../../../WidgetOptionsModal/OptionsRadioGroup/OptionsRadioGroup";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";

interface Props {
  open: boolean;
  granularity: Granularity;
  period: OverviewPeriod;
  onClose: () => void;
  onConfirm: (next: { granularity: Granularity; period: OverviewPeriod }) => void;
}

/** Modal "Tùy chọn" của widget "Tình hình thu chi tiền theo thời gian". */
export function CashFlowOptionsModal({
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

  const allowedPeriods = CASH_FLOW_PERIODS[draftGranularity] ?? [];

  // Đổi "Thống kê theo" → danh sách kỳ đổi theo; kỳ không còn hợp lệ thì lùi
  // về phần tử đầu của danh sách mới.
  const changeGranularity = (next: Granularity) => {
    setDraftGranularity(next);
    setDraftPeriod((current) =>
      keepOrResetPeriod(current, CASH_FLOW_PERIODS[next] ?? []),
    );
  };

  return (
    <WidgetOptionsModal
      open={open}
      width={520}
      // 2 dòng: "Thống kê theo" + "Kỳ báo cáo"
      height={237}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({ granularity: draftGranularity, period: draftPeriod })
      }
    >
      <OptionsFormRow label="Thống kê theo">
        <OptionsRadioGroup
          name="cash-flow-granularity"
          ariaLabel="Thống kê theo"
          value={draftGranularity}
          options={granularityOptions(CASH_FLOW_GRANULARITIES)}
          onChange={(v) => changeGranularity(v as Granularity)}
        />
      </OptionsFormRow>

      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(allowedPeriods)}
          value={draftPeriod}
          onValueChange={(v) => setDraftPeriod(v as OverviewPeriod)}
          searchable
          className="h-9 rounded-sm border-[#BDBDBD] px-2 text-[13px]"
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>
    </WidgetOptionsModal>
  );
}
