import { SingleSelect } from "@erp/ui";
import { useEffect, useState } from "react";
import {
  REVENUE_WIDGET_PERIODS,
  periodOptions,
  type OverviewPeriod,
} from "../../../_lib/period";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

interface Props {
  open: boolean;
  period: OverviewPeriod;
  onClose: () => void;
  onConfirm: (period: OverviewPeriod) => void;
}

/** Modal "Tùy chọn" của widget "Doanh thu, chi phí, lợi nhuận" — chỉ 1 dòng. */
export function RevenueCostProfitOptionsModal({
  open,
  period,
  onClose,
  onConfirm,
}: Props) {
  const [draftPeriod, setDraftPeriod] = useState(period);

  // Mở modal → nạp lại từ state đang áp dụng, bỏ bản nháp của lần mở trước.
  useEffect(() => {
    if (open) setDraftPeriod(period);
  }, [open, period]);

  return (
    <WidgetOptionsModal
      open={open}
      width={520}
      // 1 dòng "Kỳ báo cáo"
      height={189}
      onClose={onClose}
      onConfirm={() => onConfirm(draftPeriod)}
    >
      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(REVENUE_WIDGET_PERIODS)}
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
