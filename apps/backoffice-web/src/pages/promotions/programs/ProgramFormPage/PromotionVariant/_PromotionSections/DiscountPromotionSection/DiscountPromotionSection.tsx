import { Input, MoneyInput } from "@erp/ui";
import type { DiscountType, ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

export function DiscountPromotionSection({ form, onChange }: Props) {
  const select = (type: DiscountType) => onChange({ discountType: type });
  const isPercent = form.discountType === "PERCENT";
  const isAmount = form.discountType === "AMOUNT";

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Khuyến mại
      </h2>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="discount-type"
              className="shrink-0 accent-primary"
              checked={isPercent}
              onChange={() => select("PERCENT")}
            />
            Giảm giá theo
          </label>
          <Input
            type="number"
            min={0}
            className="w-32 text-right tabular-nums"
            disabled={!isPercent}
            value={form.discountPercent}
            onChange={(e) =>
              onChange({
                discountPercent:
                  e.target.value === "" ? "" : Number(e.target.value),
              })
            }
          />
          <span className="text-muted-foreground">%</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="discount-type"
              className="shrink-0 accent-primary"
              checked={isAmount}
              onChange={() => select("AMOUNT")}
            />
            Giảm giá theo số tiền
          </label>
          <MoneyInput
            className="w-48"
            disabled={!isAmount}
            value={form.discountAmount}
            onChange={(v) => onChange({ discountAmount: v })}
          />
        </div>
      </div>
    </section>
  );
}
