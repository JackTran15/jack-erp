import { RadioGroup } from "../../../../../../../components/forms/RadioGroup";
import { APPLY_SCOPE_OPTIONS } from "../../../../program-form.constants";
import type { ApplyScope, ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function ApplyScopePromotionSection({ form, onChange }: Props) {
  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Phạm vi áp dụng
      </h2>
      <RadioGroup
        name="apply-scope"
        value={form.applyScope}
        options={APPLY_SCOPE_OPTIONS}
        onChange={(v: ApplyScope) => onChange({ applyScope: v })}
      />
    </section>
  );
}
