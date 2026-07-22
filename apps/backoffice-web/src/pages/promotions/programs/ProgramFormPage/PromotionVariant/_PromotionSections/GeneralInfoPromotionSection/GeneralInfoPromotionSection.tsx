import { FormField, Input, SingleSelect } from "@erp/ui";
import {
  PromotionApplyTo,
  PROMOTION_APPLY_TO_OPTIONS,
} from "../../../../programs.constants";
import {
  BIRTHDAY_DATE_MODE_OPTIONS,
  CARD_TIER_OPTIONS,
  FORM_LABEL_WIDTH,
} from "../../../../program-form.constants";
import type {
  BirthdayDateMode,
  ProgramFormState,
} from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const LABEL_WIDTH = FORM_LABEL_WIDTH;

function parseDays(value: string): number | "" {
  return value === "" ? "" : Number(value);
}

export function GeneralInfoPromotionSection({ form, onChange }: Props) {
  const isBirthday = form.applyTo === PromotionApplyTo.HAS_BIRTHDAY;
  const isCardTier = form.applyTo === PromotionApplyTo.HAS_CARD_TIER;
  const isBirthdayRange = form.birthdayDateMode === "RANGE";

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
        >
          <Input
            id="program-name"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nhập tên chương trình"
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
          <FormField label="Hạng thẻ" layout="horizontal" labelWidth={LABEL_WIDTH}>
            <SingleSelect
              options={CARD_TIER_OPTIONS}
              value={form.cardTier}
              onValueChange={(v) => onChange({ cardTier: v })}
              className="w-80"
            />
          </FormField>
        ) : null}
      </div>
    </section>
  );
}
