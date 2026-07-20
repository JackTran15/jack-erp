import { MoneyInput, SingleSelect } from "@erp/ui";
import { HelpCircle } from "lucide-react";
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
  /** Loại "Tặng hàng hóa" hiển thị thêm checkbox cấp số nhân trong cụm MIN_TOTAL. */
  showGiftMultiplier?: boolean;
}

export function ConditionSection({
  form,
  onChange,
  showGiftMultiplier = false,
}: Props) {
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

        {showGiftMultiplier ? (
          <label
            className={`ml-6 flex items-center gap-2 ${
              isMinTotal
                ? "cursor-pointer text-foreground"
                : "text-muted-foreground"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border border-input accent-primary"
              disabled={!isMinTotal}
              checked={form.giftMultiplyByTotal}
              onChange={(e) =>
                onChange({ giftMultiplyByTotal: e.target.checked })
              }
            />
            Tăng số lượng quà tặng theo cấp số nhân của tổng tiền hóa đơn
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </label>
        ) : null}

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
