import { Input } from "@erp/ui";
import { DownloadCloud, UploadCloud } from "lucide-react";
import { BuyGetProductGrid } from "./BuyGetProductGrid/BuyGetProductGrid";
import { pickModeForTierTarget } from "../../../../../components/PromotionTargetPicker/promotion-target";
import {
  BUY_GET_GIFT_POLICY_OPTIONS,
  GIFT_MODE_OPTIONS,
  TIER_TARGET_OPTIONS,
} from "../../../../program-form.constants";
import { BuyGetGiftPolicy } from "../../../../program-form.types";
import type {
  GiftMode,
  ProgramFormState,
  TierTarget,
} from "../../../../program-form.types";

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
export function BuyGetPromotionSection({ form, onChange }: Props) {
  const target = form.buyGetPurchaseTarget;
  /** Hai chế độ đọc hai bộ input rời nhau — xem chú thích ở từng khối bên dưới. */
  const isCheapest = form.buyGetGiftPolicy === BuyGetGiftPolicy.CHEAPEST;

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
            <span className="flex items-center gap-2">
              Mua
              <Input
                type="number"
                min={1}
                className="h-8 w-16 text-center tabular-nums"
                aria-label="Số lượng phải mua"
                value={form.buyQuantity}
                onChange={(e) =>
                  onChange({
                    buyQuantity: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
              trong những hàng hóa sau
            </span>
            <ImportExport canExport={form.buyGetPurchaseRows.length > 0} />
          </div>

          {/*
            "n" chỉ có nghĩa ở chế độ "Tặng hàng hóa rẻ nhất": engine tính
            `floor(số đơn vị mua / m) × n` đơn vị rẻ nhất **lấy ra từ chính lưới
            điều kiện mua`. Ở chế độ "Tặng hàng hóa cụ thể", số lượng tặng nằm ở
            cột "SL tặng" của từng dòng quà, còn `giftQuantity` không được đọc —
            nên hiện ô này ở đó chỉ là một ô lừa người dùng.
          */}
          {isCheapest ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Tặng
              <Input
                type="number"
                min={1}
                className="h-8 w-16 text-center tabular-nums"
                aria-label="Số lượng hàng hóa rẻ nhất được tặng"
                value={form.giftQuantity}
                onChange={(e) =>
                  onChange({
                    giftQuantity:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
              hàng hóa rẻ nhất trong số đó
            </div>
          ) : null}

          <BuyGetProductGrid
            value={form.buyGetPurchaseRows}
            onChange={(rows) => onChange({ buyGetPurchaseRows: rows })}
            codeLabel={CODE_LABEL[target]}
            nameLabel={NAME_LABEL[target]}
            quantityLabel="SL"
            pickMode={pickModeForTierTarget(target)}
            pickerTitle="Chọn hàng hóa điều kiện mua"
          />
        </div>

        {/* Cột phải: hàng được tặng */}
        <div className="flex flex-col gap-4 md:border-l md:border-border md:pl-6">
          <h3 className="text-sm font-bold text-foreground">Hàng hóa được tặng</h3>

          {/*
            `BuyMGetNStrategy.computeCheapest()` chỉ đọc các dòng `role=CONDITION`
            — nó **không chạm** lưới quà. Đó cũng là lý do BR-004 miễn trừ
            `REWARD_LINES_EMPTY` cho `BUY_M_GET_N` + `CHEAPEST` (A-27). Hiện lưới
            này ở chế độ đó là mời người dùng điền một thứ bị bỏ qua im lặng.
          */}
          {isCheapest ? (
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Chế độ <strong>Tặng hàng hóa rẻ nhất</strong> lấy quà ra từ chính
              những hàng hóa khách đã mua ở cột bên trái, nên không cần chọn danh
              sách hàng tặng riêng.
            </p>
          ) : (
            <>
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
            pickMode="ITEM"
            pickerTitle="Chọn hàng hóa được tặng"
          />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
