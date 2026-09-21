import { SingleSelect } from "@erp/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  DisplayMode,
  Row3LeftState,
  ShareDimension,
} from "../../../../../store/page-stores/overview/overview.interface";
import { ALL_VALUE } from "../../../../../store/page-stores/overview/overview.interface";
import {
  PRODUCT_SHARE_PERIODS,
  periodOptions,
  type OverviewPeriod,
} from "../../../_lib/period";
import { useCategoryOptions } from "../../../_lib/useCategoryOptions";
import {
  fetchProductGroups,
  productGroupsQueryKey,
} from "../../../../../components/shared/product-select/useProductSearch";
import { OptionsFormRow } from "../../../WidgetOptionsModal/OptionsFormRow/OptionsFormRow";
import { OptionsRadioGroup } from "../../../WidgetOptionsModal/OptionsRadioGroup/OptionsRadioGroup";
import { WidgetOptionsModal } from "../../../WidgetOptionsModal/WidgetOptionsModal";
import { OVERVIEW_SELECT_CLASS } from "../../../_lib/selectClass";

const DIMENSION_OPTIONS = [
  { value: "product_group", label: "Nhóm hàng hóa" },
  { value: "variant", label: "Mẫu mã" },
  { value: "product", label: "Hàng hóa" },
];

const DISPLAY_OPTIONS = [
  { value: "name", label: "Tên hàng hóa" },
  { value: "sku", label: "Mã SKU" },
];

/** Số dòng của form theo "Thống kê theo" → chiều cao khung. */
const ROWS_BY_DIMENSION: Record<ShareDimension, number> = {
  product_group: 3, // Thống kê theo, Nhóm hàng hóa, Kỳ báo cáo
  variant: 4, //      + Hiển thị
  product: 5, //      + Mẫu mã + Hiển thị
};

/** 40 (tiêu đề) + [32 + 16 + 36n + 12(n−1)] + 65 (footer). */
function modalHeight(dimension: ShareDimension): number {
  const rows = ROWS_BY_DIMENSION[dimension];
  return 40 + (32 + 16 + 36 * rows + 12 * (rows - 1)) + 65;
}

type Draft = Pick<
  Row3LeftState,
  "dimension" | "categoryId" | "variantId" | "period" | "displayMode"
>;

interface Props {
  open: boolean;
  state: Draft;
  onClose: () => void;
  onConfirm: (next: Draft) => void;
}


/**
 * Modal "Tùy chọn" dùng chung cho cả hai loại báo cáo của widget trái row 3.
 * Số field hiện ra thay đổi theo radio "Thống kê theo".
 */
export function ProductShareOptionsModal({ open, state, onClose, onConfirm }: Props) {
  const [draft, setDraft] = useState<Draft>(state);

  useEffect(() => {
    if (open) setDraft(state);
  }, [open, state]);

  const showVariant = draft.dimension === "product";
  const showDisplay = draft.dimension !== "product_group";

  // "Nhóm hàng hóa": chỉ nhóm cha khi thống kê theo nhóm, ngược lại cả cha+con.
  const categories = useCategoryOptions(draft.dimension === "product_group", open);

  // Mẫu mã thật, lọc theo nhóm đang chọn (API trả tối đa 100 dòng / trang).
  const variantParams = {
    page: 1,
    pageSize: 100,
    categoryId: draft.categoryId === ALL_VALUE ? undefined : draft.categoryId,
  };
  const variants = useQuery({
    queryKey: productGroupsQueryKey(variantParams),
    queryFn: () => fetchProductGroups(variantParams),
    enabled: open && showVariant,
  });

  const variantOptions = useMemo(
    () => [
      { value: ALL_VALUE, label: "Tất cả" },
      ...(variants.data?.data ?? []).map((v) => ({ value: v.id, label: v.name })),
    ],
    [variants.data],
  );

  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  return (
    <WidgetOptionsModal
      open={open}
      width={520}
      height={modalHeight(draft.dimension)}
      onClose={onClose}
      onConfirm={() => onConfirm(draft)}
    >
      <OptionsFormRow label="Thống kê theo">
        <OptionsRadioGroup
          name="product-share-dimension"
          ariaLabel="Thống kê theo"
          value={draft.dimension}
          options={DIMENSION_OPTIONS}
          onChange={(v) => patch({ dimension: v as ShareDimension })}
        />
      </OptionsFormRow>

      <OptionsFormRow label="Nhóm hàng hóa">
        <SingleSelect
          options={categories.options}
          value={draft.categoryId}
          // Đổi nhóm → mẫu mã cũ không còn thuộc nhóm nữa, đưa về "Tất cả".
          onValueChange={(v) => patch({ categoryId: v, variantId: ALL_VALUE })}
          searchable
          className={OVERVIEW_SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>

      {showVariant ? (
        <OptionsFormRow label="Mẫu mã">
          <SingleSelect
            options={variantOptions}
            value={draft.variantId}
            onValueChange={(v) => patch({ variantId: v })}
            searchable
            className={OVERVIEW_SELECT_CLASS}
            contentClassName="text-[13px]"
          />
        </OptionsFormRow>
      ) : null}

      <OptionsFormRow label="Kỳ báo cáo">
        <SingleSelect
          options={periodOptions(PRODUCT_SHARE_PERIODS)}
          value={draft.period}
          onValueChange={(v) => patch({ period: v as OverviewPeriod })}
          searchable
          className={OVERVIEW_SELECT_CLASS}
          contentClassName="text-[13px]"
        />
      </OptionsFormRow>

      {showDisplay ? (
        <OptionsFormRow label="Hiển thị">
          <OptionsRadioGroup
            name="product-share-display"
            ariaLabel="Hiển thị"
            value={draft.displayMode}
            options={DISPLAY_OPTIONS}
            onChange={(v) => patch({ displayMode: v as DisplayMode })}
          />
        </OptionsFormRow>
      ) : null}
    </WidgetOptionsModal>
  );
}
