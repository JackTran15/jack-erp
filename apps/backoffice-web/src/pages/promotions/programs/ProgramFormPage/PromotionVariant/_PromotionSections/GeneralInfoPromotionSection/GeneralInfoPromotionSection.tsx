import { FormField, Input, SingleSelect } from "@erp/ui";
import {
  PromotionApplyTo,
  PromotionStatus,
  PROMOTION_APPLY_TO_OPTIONS,
  PROMOTION_FORM_LABELS,
  PROMOTION_STATUS_OPTIONS,
} from "../../../../programs.constants";
import { usePromotionFormMode } from "../../../promotion-form-mode.context";
import {
  BIRTHDAY_DATE_MODE_OPTIONS,
  CARD_TIER_OPTIONS,
  FORM_LABEL_WIDTH,
} from "../../../../program-form.constants";
import { BirthdayDateMode } from "../../../../program-form.types";
import type { ProgramFormState } from "../../../../program-form.types";
import { useFieldIssue } from "../../../promotion-issues.context";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const LABEL_WIDTH = FORM_LABEL_WIDTH;

function parseDays(value: string): number | "" {
  return value === "" ? "" : Number(value);
}

export function GeneralInfoPromotionSection({ form, onChange }: Props) {
  const { isEdit, promotionForm } = usePromotionFormMode();
  const isBirthday = form.applyTo === PromotionApplyTo.HAS_BIRTHDAY;
  const isCardTier = form.applyTo === PromotionApplyTo.HAS_CARD_TIER;
  const isBirthdayRange = form.birthdayDateMode === BirthdayDateMode.RANGE;
  const nameIssue = useFieldIssue("name");
  const cardTierIssue = useFieldIssue("cardTierId");

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Thông tin chung
      </h2>
      <div className="flex flex-col gap-2">
        <FormField
          label="Tên chương trình"
          htmlFor="program-name"
          required
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
          error={nameIssue}
        >
          <Input
            id="program-name"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nhập tên chương trình"
            aria-invalid={nameIssue ? true : undefined}
          />
        </FormField>

        <FormField
          label="Mô tả"
          htmlFor="program-description"
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
        >
          <Input
            id="program-description"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </FormField>

        {isEdit && promotionForm ? (
          <FormField
            label="Hình thức khuyến mại"
            layout="horizontal"
            labelWidth={LABEL_WIDTH}
            hint="Không đổi được sau khi tạo. Muốn đổi hình thức, hãy nhân bản chương trình này."
          >
            {/* FR-006 — `type` bất biến. Hiển thị chữ read-only thay vì một
                dropdown disabled: không có control nào để bấm thì rõ ràng hơn
                là một control bấm không được. */}
            <p className="pt-2 text-sm font-medium">
              {PROMOTION_FORM_LABELS[promotionForm]}
            </p>
          </FormField>
        ) : null}

        <FormField
          label="Áp dụng cho"
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
        >
          <SingleSelect
            options={PROMOTION_APPLY_TO_OPTIONS}
            value={form.applyTo}
            onValueChange={(v) => onChange({ applyTo: v as PromotionApplyTo })}
            className="max-w-xl"
          />
        </FormField>

        {isBirthday ? (
          <FormField
            label="Ngày tính KM"
            layout="horizontal"
            labelWidth={LABEL_WIDTH}
          >
            <div className="flex flex-wrap items-center gap-3">
              <SingleSelect
                options={BIRTHDAY_DATE_MODE_OPTIONS}
                value={form.birthdayDateMode}
                onValueChange={(v) =>
                  onChange({ birthdayDateMode: v as BirthdayDateMode })
                }
                className="w-80"
              />
              {isBirthdayRange ? (
                <>
                  <span className="text-muted-foreground">Trước ngày sinh</span>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    value={form.birthdayBeforeDays}
                    onChange={(e) =>
                      onChange({ birthdayBeforeDays: parseDays(e.target.value) })
                    }
                  />
                  <span className="text-muted-foreground">ngày</span>
                  <span className="text-muted-foreground">- Sau ngày sinh</span>
                  <Input
                    type="number"
                    min={0}
                    className="w-20"
                    value={form.birthdayAfterDays}
                    onChange={(e) =>
                      onChange({ birthdayAfterDays: parseDays(e.target.value) })
                    }
                  />
                  <span className="text-muted-foreground">ngày</span>
                </>
              ) : null}
            </div>
          </FormField>
        ) : null}

        {isCardTier ? (
          <FormField
            label="Hạng thẻ"
            layout="horizontal"
            labelWidth={LABEL_WIDTH}
            error={cardTierIssue}
          >
            <SingleSelect
              options={CARD_TIER_OPTIONS}
              value={form.cardTier}
              onValueChange={(v) => onChange({ cardTier: v })}
              className="w-80"
            />
          </FormField>
        ) : null}

        {isEdit ? (
          <FormField
            label="Trạng thái"
            layout="horizontal"
            labelWidth={LABEL_WIDTH}
          >
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {PROMOTION_STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="program-status"
                    className="h-4 w-4 cursor-pointer accent-primary"
                    checked={form.status === opt.value}
                    onChange={() =>
                      onChange({ status: opt.value as PromotionStatus })
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </FormField>
        ) : null}

        <FormField
          label="Độ ưu tiên"
          htmlFor="program-priority"
          layout="horizontal"
          labelWidth={LABEL_WIDTH}
          hint="Số nhỏ được áp trước. Khi hai chương trình cùng tranh một mặt hàng, chương trình có độ ưu tiên nhỏ hơn thắng."
        >
          <Input
            id="program-priority"
            type="number"
            min={0}
            className="w-40"
            value={form.priority}
            onChange={(e) =>
              onChange({
                priority: e.target.value === "" ? 0 : Number(e.target.value),
              })
            }
          />
        </FormField>
      </div>
    </section>
  );
}
