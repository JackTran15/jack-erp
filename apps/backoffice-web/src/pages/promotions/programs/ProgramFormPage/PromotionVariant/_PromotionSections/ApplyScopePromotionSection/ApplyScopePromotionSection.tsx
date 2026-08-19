import { APPLY_SCOPE_OPTIONS } from "../../../../program-form.constants";
import { ApplyScope, type ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function ApplyScopePromotionSection(_props: Props) {
  const label = APPLY_SCOPE_OPTIONS.find((o) => o.value === ApplyScope.ALL_ITEMS)!.label;
  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Phạm vi áp dụng
      </h2>
      <p className="text-sm">{label}</p>
    </section>
  );
}
