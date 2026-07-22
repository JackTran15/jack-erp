import { DownloadCloud, UploadCloud } from "lucide-react";
import { AutoApplyCheckbox } from "../PromotionVariant/_PromotionSections/AutoApplyCheckbox/AutoApplyCheckbox";
import { GiftProductGrid } from "./GiftProductGrid/GiftProductGrid";
import { GIFT_MODE_OPTIONS } from "../../program-form.constants";
import type { GiftMode, ProgramFormState } from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/** Section "Tặng hàng hóa": hình thức tặng + Nhập/Xuất khẩu + grid 5 cột hàng quà. */
export function GiftSection({ form, onChange }: Props) {
  const canExport = form.giftProducts.length > 0;

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Tặng hàng hóa
      </h2>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-12">
          {GIFT_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="gift-mode"
                className="shrink-0 accent-primary"
                checked={form.giftMode === opt.value}
                onChange={() => onChange({ giftMode: opt.value as GiftMode })}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-6 font-bold">
          <button
            type="button"
            className="flex items-center gap-2 text-primary hover:opacity-70"
          >
            <UploadCloud className="h-4 w-4" />
            Nhập khẩu
          </button>
          <button
            type="button"
            disabled={!canExport}
            aria-disabled={!canExport}
            title={canExport ? undefined : "Chưa có dữ liệu để xuất"}
            className="flex items-center gap-2 text-primary hover:opacity-70 disabled:pointer-events-none disabled:text-muted-foreground"
          >
            <DownloadCloud className="h-4 w-4" />
            Xuất khẩu
          </button>
        </div>
      </div>

      <GiftProductGrid
        value={form.giftProducts}
        onChange={(rows) => onChange({ giftProducts: rows })}
      />

      <AutoApplyCheckbox
        checked={form.autoApply}
        onChange={(v) => onChange({ autoApply: v })}
      />
    </section>
  );
}
