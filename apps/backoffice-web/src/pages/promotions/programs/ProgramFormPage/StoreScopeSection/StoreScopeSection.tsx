import { MultiSelectChips } from "@erp/ui";
import { HelpCircle } from "lucide-react";
import { RadioGroup } from "../../../../../components/forms/RadioGroup";
import { useMyBranches } from "../../../../../hooks/iam/useBranches";
import { SectionHeader } from "../SectionHeader/SectionHeader";
import {
  FORM_LABEL_WIDTH,
  STORE_SCOPE_OPTIONS,
} from "../../program-form.constants";
import type { ProgramFormState, StoreScope } from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function StoreScopeSection({ form, onChange }: Props) {
  const { data: branches = [] } = useMyBranches();
  const storeOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  return (
    <section>
      <SectionHeader title="Cửa hàng áp dụng" />
      <div
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: `${FORM_LABEL_WIDTH} 1fr` }}
      >
        <span className="inline-flex items-center gap-1 pt-2 text-sm">
          Áp dụng tại
          <HelpCircle
            className="h-4 w-4 text-muted-foreground"
            aria-label="Phạm vi cửa hàng áp dụng chương trình"
          />
        </span>
        <div className="flex flex-col gap-3">
          <RadioGroup
            name="store-scope"
            value={form.storeScope}
            options={STORE_SCOPE_OPTIONS}
            onChange={(v: StoreScope) => onChange({ storeScope: v })}
          />
          {form.storeScope === "SELECTED" ? (
            <MultiSelectChips
              options={storeOptions}
              value={form.storeIds}
              onValueChange={(ids) => onChange({ storeIds: ids })}
              placeholder="Chọn cửa hàng…"
              className="max-w-xl"
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
