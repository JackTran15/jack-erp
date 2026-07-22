import { PromotionApplyTo, PromotionForm } from "../../../programs.constants";
import {
  BirthdayDateMode,
  CalcBasis,
  ConditionType,
  DiscountType,
} from "../../../program-form.types";
import type { ProgramFormState } from "../../../program-form.types";

/** Cụm "Điều kiện áp dụng" của payload, tổ chức theo loại điều kiện. */
function buildConditionPayload(form: ProgramFormState) {
  if (form.conditionType === ConditionType.MIN_TOTAL) {
    return {
      type: form.conditionType,
      minTotalAmount: form.minTotalAmount,
      calcBasis: form.calcBasis,
      ...(form.calcBasis === CalcBasis.PRODUCT_GROUP && {
        group: {
          logic: form.applicableGroupLogic,
          items: form.applicableGroups
            .filter((g) => g.groupId)
            .map(({ groupId, code, name }) => ({ groupId, code, name })),
        },
      }),
    };
  }

  if (form.conditionType === ConditionType.SPECIFIC_QUANTITY) {
    return {
      type: form.conditionType,
      goods: form.applicableGoods
        .filter((g) => g.itemId)
        .map(({ itemId, sku, name, unit, minQuantity }) => ({
          itemId,
          sku,
          name,
          unit,
          minQuantity,
        })),
    };
  }

  return { type: form.conditionType };
}

/**
 * Dựng payload submit cho chương trình "Giảm giá hóa đơn" (INVOICE_DISCOUNT) —
 * chỉ gom field liên quan, theo nhóm section, kèm nhánh điều kiện; bỏ row trống.
 */
export function buildInvoiceDiscountPayload(form: ProgramFormState) {
  return {
    promotionType: PromotionForm.INVOICE_DISCOUNT,
    generalInfo: {
      name: form.name.trim(),
      description: form.description.trim(),
      applyTo: form.applyTo,
      ...(form.applyTo === PromotionApplyTo.HAS_BIRTHDAY && {
        birthday: {
          dateMode: form.birthdayDateMode,
          ...(form.birthdayDateMode === BirthdayDateMode.RANGE && {
            beforeDays: form.birthdayBeforeDays,
            afterDays: form.birthdayAfterDays,
          }),
        },
      }),
      ...(form.applyTo === PromotionApplyTo.HAS_CARD_TIER && {
        cardTier: form.cardTier,
      }),
    },
    time: {
      startDate: form.startDate,
      endDate: form.endDate,
      daysOfWeek: form.daysOfWeek,
      startTime: form.startTime,
      endTime: form.endTime,
    },
    store: {
      scope: form.storeScope,
      storeIds: form.storeIds,
    },
    applyScope: form.applyScope,
    discount: {
      type: form.discountType,
      value:
        form.discountType === DiscountType.PERCENT
          ? form.discountPercent
          : form.discountAmount,
    },
    condition: buildConditionPayload(form),
    autoApply: form.autoApply,
  };
}
