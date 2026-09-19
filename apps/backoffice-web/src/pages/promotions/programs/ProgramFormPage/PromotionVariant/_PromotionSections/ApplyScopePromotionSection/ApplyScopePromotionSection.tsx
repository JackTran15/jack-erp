import { TriangleAlert } from "lucide-react";
import { RadioGroup } from "../../../../../../../components/forms/RadioGroup";
import {
  APPLY_SCOPE_OPTIONS,
  FORM_LABEL_WIDTH,
} from "../../../../program-form.constants";
import { ApplyScope, type ProgramFormState } from "../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/**
 * Radio "Phạm vi áp dụng" của CTKM giảm giá hóa đơn (BR-002).
 *
 * Từng là radio, bị `promotion-scope-points-toggle` (ADR-01, 2026-08-17) thay
 * bằng một nhãn cố định "Tất cả hàng hóa trong hóa đơn". Khôi phục ngày
 * 2026-09-18 theo ADR-01 của `2026091803-ctkm-item-discount-invoice-scope`,
 * bản ADR đó ghi rõ nó supersede quyết định tháng 8.
 *
 * Mặc định `NON_PROMO_ONLY` đặt ở `emptyForm`, **không** ở đây và cũng không ở
 * mapper (ADR-03): nhờ vậy đường sửa nạp thẳng giá trị đang lưu qua
 * `applyScopeFromApi` mà không bị mặc định của form thêm-mới đè lên.
 */
export function ApplyScopePromotionSection({ form, onChange }: Props) {
  return (
    <section>
      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground first:mt-0">
        Phạm vi áp dụng
      </h2>
      <div
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: `${FORM_LABEL_WIDTH} 1fr` }}
      >
        <span className="pt-2 text-sm">Áp dụng cho</span>
        <div className="flex flex-col gap-2">
          <RadioGroup
            name="apply-scope"
            value={form.applyScope}
            options={APPLY_SCOPE_OPTIONS}
            onChange={(v: ApplyScope) => onChange({ applyScope: v })}
          />
          {form.applyScope === ApplyScope.ALL_ITEMS ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <span>
                Phần giảm sẽ tính trên <strong>cả</strong> những mặt hàng đã được
                chương trình khuyến mại khác giảm giá, tức là giảm chồng lên nhau.
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
