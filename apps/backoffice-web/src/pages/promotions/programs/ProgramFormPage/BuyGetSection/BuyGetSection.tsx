import { DownloadCloud, UploadCloud } from "lucide-react";
import { BuyGetProductGrid } from "./BuyGetProductGrid/BuyGetProductGrid";
import {
  BUY_GET_GIFT_POLICY_OPTIONS,
  GIFT_MODE_OPTIONS,
  TIER_TARGET_OPTIONS,
} from "../../program-form.constants";
import type {
  BuyGetGiftPolicy,
  GiftMode,
  ProgramFormState,
  TierTarget,
} from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

const CODE_LABEL: Record<TierTarget, string> = {
  PRODUCT: "Mã SKU",
  VARIANT: "Mã mẫu mã",
  GROUP: "Mã nhóm hàng hóa",
};

const NAME_LABEL: Record<TierTarget, string> = {
  PRODUCT: "Tên hàng hóa",
  VARIANT: "Tên mẫu mã",
  GROUP: "Tên nhóm hàng hóa",
};

/** Cụm Nhập/Xuất khẩu của mỗi cột (Xuất khẩu disabled khi grid rỗng). */
function ImportExport({ canExport }: { canExport: boolean }) {
  return (
    <div className="flex items-center gap-4 text-sm font-bold">
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
  );
}

/** Section "Khuyến mại" cho loại mua m tặng n: bố cục 2 cột (điều kiện mua ↔ hàng được tặng). */
export function BuyGetSection({ form, onChange }: Props) {
  const target = form.buyGetPurchaseTarget;

  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Khuyến mại
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Cột trái: điều kiện mua */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-bold text-foreground">
            Điều kiện mua để được hưởng khuyến mại
          </h3>

          <div className="flex flex-wrap items-center gap-5 text-sm">
            {BUY_GET_GIFT_POLICY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="radio"
                  name="buyget-policy"
                  className="shrink-0 accent-primary"
                  checked={form.buyGetGiftPolicy === opt.value}
                  onChange={() =>
                    onChange({ buyGetGiftPolicy: opt.value as BuyGetGiftPolicy })
                  }
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-8 text-sm">
            {TIER_TARGET_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="radio"
                  name="buyget-target"
                  className="shrink-0 accent-primary"
                  checked={target === opt.value}
                  onChange={() =>
                    onChange({ buyGetPurchaseTarget: opt.value as TierTarget })
                  }
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Mua <strong>1 trong những</strong> hàng hóa sau
            </span>
            <ImportExport canExport={form.buyGetPurchaseRows.length > 0} />
          </div>

          <BuyGetProductGrid
            value={form.buyGetPurchaseRows}
            onChange={(rows) => onChange({ buyGetPurchaseRows: rows })}
            codeLabel={CODE_LABEL[target]}
            nameLabel={NAME_LABEL[target]}
            quantityLabel="SL"
          />
        </div>

        {/* Cột phải: hàng được tặng */}
        <div className="flex flex-col gap-4 md:border-l md:border-border md:pl-6">
          <h3 className="text-sm font-bold text-foreground">Hàng hóa được tặng</h3>

          <div className="flex flex-wrap items-center gap-8 text-sm">
            {GIFT_MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2"
              >
                <input
                  type="radio"
                  name="buyget-gift-mode"
                  className="shrink-0 accent-primary"
                  checked={form.buyGetGiftMode === opt.value}
                  onChange={() =>
                    onChange({ buyGetGiftMode: opt.value as GiftMode })
                  }
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex justify-end">
            <ImportExport canExport={form.buyGetGiftRows.length > 0} />
          </div>

          <BuyGetProductGrid
            value={form.buyGetGiftRows}
            onChange={(rows) => onChange({ buyGetGiftRows: rows })}
            codeLabel="Mã SKU"
            nameLabel="Tên hàng hóa"
            quantityLabel="SL tặng"
          />
        </div>
      </div>
    </section>
  );
}
