import { HelpCircle } from "lucide-react";
import { ProductGroupsGrid } from "./ProductGroupsGrid/ProductGroupsGrid";
import { ProductGroupLogic } from "../../../../../program-form.types";
import type { ProgramFormState } from "../../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function ProductGroupSection({ form, onChange }: Props) {
  const select = (logic: ProductGroupLogic) =>
    onChange({ applicableGroupLogic: logic });

  return (
    <section>
      <div className="mb-3 mt-8 flex flex-wrap items-center gap-x-12 gap-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Nhóm hàng hóa áp dụng
        </h3>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="group-logic"
              className="shrink-0 accent-primary"
              checked={form.applicableGroupLogic === ProductGroupLogic.ANY}
              onChange={() => select(ProductGroupLogic.ANY)}
            />
            Hàng hóa thuộc 1 trong các nhóm sau
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="group-logic"
              className="shrink-0 accent-primary"
              checked={form.applicableGroupLogic === ProductGroupLogic.ALL}
              onChange={() => select(ProductGroupLogic.ALL)}
            />
            Hàng hóa thuộc tất cả các nhóm sau
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </label>
        </div>
      </div>

      <ProductGroupsGrid
        value={form.applicableGroups}
        onChange={(groups) => onChange({ applicableGroups: groups })}
      />
    </section>
  );
}
