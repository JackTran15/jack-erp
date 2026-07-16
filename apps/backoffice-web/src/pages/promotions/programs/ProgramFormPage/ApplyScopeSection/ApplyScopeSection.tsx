import { RadioGroup } from "../../../../../components/forms/RadioGroup";
import { SectionHeader } from "../SectionHeader/SectionHeader";
import { APPLY_SCOPE_OPTIONS } from "../../program-form.constants";
import type { ApplyScope, ProgramFormState } from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function ApplyScopeSection({ form, onChange }: Props) {
  return (
    <section>
      <SectionHeader title="Phạm vi áp dụng" />
      <RadioGroup
        name="apply-scope"
        value={form.applyScope}
        options={APPLY_SCOPE_OPTIONS}
        onChange={(v: ApplyScope) => onChange({ applyScope: v })}
      />
    </section>
  );
}
