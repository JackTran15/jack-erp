import { FormField, Input, SingleSelect } from "@erp/ui";
import { PROMOTION_APPLY_TO_OPTIONS } from "../../../../programs.constants";
import { FORM_LABEL_WIDTH } from "../../../../program-form.constants";
import type { PromotionApplyTo } from "../../../../programs.types";
import type { ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const LABEL_WIDTH = FORM_LABEL_WIDTH;

export function GeneralInfoPromotionSection({ form, onChange }: Props) {
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
      </div>
    </section>
  );
}
