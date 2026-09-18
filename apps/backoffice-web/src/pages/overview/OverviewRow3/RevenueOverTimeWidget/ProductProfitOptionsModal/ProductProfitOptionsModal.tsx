import { SingleSelect } from "@erp/ui";
import { useEffect, useMemo, useState } from "react";
import type { Row3RightState } from "../../../../../store/page-stores/overview/overview.interface";
import {
  PRODUCT_PROFIT_GRANULARITIES,
  PRODUCT_PROFIT_PERIODS,
  granularityOptions,
  keepOrResetPeriod,
  type Granularity,
} from "../../../_lib/granularity";
import { periodOptions, type OverviewPeriod } from "../../../_lib/period";
import { useCategoryOptions } from "../../../_lib/useCategoryOptions";
import { mockProducts, mockVariants } from "../../../_mock/catalog.mock";
import { AllOrManySelect } from "../../../WidgetOptionsModal/AllOrManySelect/AllOrManySelect";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { OptionsRadioGroup } from "../../../WidgetOptionsModal/OptionsRadioGroup/OptionsRadioGroup";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

type Draft = Pick<
  Row3RightState,
  "productGroupIds" | "variantIds" | "productIds" | "granularity" | "period"
>;

interface Props {
  open: boolean;
  state: Draft;
  onClose: () => void;
  onConfirm: (next: Draft) => void;
}

/**
 * Modal "Tùy chọn" của "Lợi nhuận hàng hóa theo thời gian" — 5 dòng, không dòng
 * nào bị ẩn. Ba dòng đầu chọn NHIỀU giá trị và phụ thuộc nhau theo thứ tự
 * nhóm → mẫu mã → hàng hóa.
 */
export function ProductProfitOptionsModal({ open, state, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<Draft>(state);

  useEffect(() => {
    if (open) setDraft(state);
  }, [open, state]);

  // Cây nhóm hàng hóa đầy đủ (cha + con, thụt lề) từ API thật.
  const categories = useCategoryOptions(false, open);
  const categoryOptions = useMemo(
    () => categories.options.filter((o) => o.label !== "Tất cả"),
    [categories.options],
  );

  // Mẫu mã lọc theo nhóm đầu tiên đang chọn; hàng hóa lọc theo mẫu mã đầu tiên.
  const variantScope = draft.productGroupIds[0] ?? "__all__";
  const variantOptions = useMemo(
    () => mockVariants(variantScope).map((v) => ({ value: v.value, label: v.label })),
    [variantScope],
  );

  const productScope = `${variantScope}|${draft.variantIds[0] ?? "__all__"}`;
  const productOptions = useMemo(
    () => mockProducts(productScope).map((p) => ({ value: p.value, label: p.label })),
    [productScope],
  );

  const allowedPeriods = PRODUCT_PROFIT_PERIODS[draft.granularity] ?? [];

  const changeGranularity = (next: Granularity) =>
    setDraft((d) => ({
      ...d,
      granularity: next,
      period: keepOrResetPeriod(d.period, PRODUCT_PROFIT_PERIODS[next] ?? []),
    }));

  return (
    <WidgetOptionsModal
      open={open}
      width={600}
      // 5 dòng
      height={381}
      onClose={onClose}
      onConfirm={() => onConfirm(draft)}
    >
      <OptionsFormRow label="Nhóm hàng hóa">
        <AllOrManySelect
          options={categoryOptions}
          value={draft.productGroupIds}
          // Đổi nhóm → mẫu mã và hàng hóa cũ không còn hợp lệ, đưa về "Tất cả".
          onChange={(ids) =>
            setDraft((d) => ({
              ...d,
              productGroupIds: ids,
              variantIds: [],
              productIds: [],
            }))
          }
          placeholder="Tất cả"
        />
      </OptionsFormRow>

      <OptionsFormRow label="Mẫu mã">
        <AllOrManySelect
          options={variantOptions}
          value={draft.variantIds}
          onChange={(ids) =>
            setDraft((d) => ({ ...d, variantIds: ids, productIds: [] }))
          }
          placeholder="Tất cả"
        />
      </OptionsFormRow>

      <OptionsFormRow label="Hàng hóa">
        <AllOrManySelect
          options={productOptions}
          value={draft.productIds}
          onChange={(ids) => setDraft((d) => ({ ...d, productIds: ids }))}
          placeholder="Tất cả"
        />
      </OptionsFormRow>

      <OptionsFormRow label="Thống kê theo">
        <OptionsRadioGroup
          name="product-profit-granularity"
          ariaLabel="Thống kê theo"
          value={draft.granularity}
          options={granularityOptions(PRODUCT_PROFIT_GRANULARITIES)}
          onChange={(v) => changeGranularity(v as Granularity)}
        />
      </OptionsFormRow>

      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(allowedPeriods)}
          value={draft.period}
          onValueChange={(v) => setDraft((d) => ({ ...d, period: v as OverviewPeriod }))}
          searchable
          className={OVERVIEW_SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>
    </WidgetOptionsModal>
  );
}
