import { MoneyInput, SingleSelect } from "@erp/ui";
import { SectionHeader } from "../SectionHeader/SectionHeader";
import { CALC_BASIS_OPTIONS } from "../../program-form.constants";
import type {
  CalcBasis,
  ConditionType,
  ProgramFormState,
} from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function ConditionSection({ form, onChange }: Props) {
  const select = (type: ConditionType) => onChange({ conditionType: type });
  const isMinTotal = form.conditionType === "MIN_TOTAL";

  return (
    <section>
      <SectionHeader title="Điều kiện áp dụng" />
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="condition-type"
            className="shrink-0 accent-primary"
            checked={form.conditionType === "NONE"}
            onChange={() => select("NONE")}
          />
          Không yêu cầu điều kiện
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="condition-type"
              className="shrink-0 accent-primary"
              checked={isMinTotal}
              onChange={() => select("MIN_TOTAL")}
            />
            Tổng tiền hàng trên hóa đơn lớn hơn hoặc bằng
          </label>
          <MoneyInput
            className="w-48"
            disabled={!isMinTotal}
            value={form.minTotalAmount}
            onChange={(v) => onChange({ minTotalAmount: v })}
          />
          <span className="text-muted-foreground">tính trên</span>
          <SingleSelect
            options={CALC_BASIS_OPTIONS}
            value={form.calcBasis}
            onValueChange={(v) => onChange({ calcBasis: v as CalcBasis })}
            disabled={!isMinTotal}
            className="w-72"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="condition-type"
            className="shrink-0 accent-primary"
            checked={form.conditionType === "SPECIFIC_QUANTITY"}
            onChange={() => select("SPECIFIC_QUANTITY")}
          />
          Yêu cầu số lượng cụ thể
        </label>
      </div>
    </section>
  );
}
