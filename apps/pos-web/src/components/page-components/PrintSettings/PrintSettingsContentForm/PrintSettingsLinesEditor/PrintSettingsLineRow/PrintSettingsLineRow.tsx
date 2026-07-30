import { cn } from "@erp/ui";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { SampleInvoiceLine } from "@erp/pos/interfaces/print-sample-invoice.interface";

export interface PrintSettingsLineRowProps {
  line: SampleInvoiceLine;
  /** Số thứ tự sẽ in ra bill — luôn theo vị trí hiện tại trong danh sách. */
  index: number;
  onChange: (patch: Partial<Omit<SampleInvoiceLine, "id">>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

const LABEL = "text-[11px] font-medium text-gray-500";

export function PrintSettingsLineRow({
  line,
  index,
  onChange,
  onRemove,
  canRemove,
}: PrintSettingsLineRowProps) {
  const autoTotal = line.qty * line.unitPrice;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold text-gray-400">#{index}</span>
        <PosTextInput
          value={line.name}
          onChange={(next) => onChange({ name: next })}
          variant="boxed"
          ariaLabel={`Tên hàng dòng ${index}`}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? "Xóa dòng" : "Hóa đơn phải còn ít nhất 1 dòng"}
          className={cn(
            "shrink-0 rounded p-1.5 text-gray-400 transition-colors",
            canRemove
              ? "hover:bg-red-50 hover:text-red-600"
              : "cursor-not-allowed opacity-40",
          )}
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Số lượng</span>
          <PosNumberInput
            value={line.qty}
            onChange={(next) => onChange({ qty: next })}
            variant="boxed"
            ariaLabel={`Số lượng dòng ${index}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Đơn giá</span>
          <PosNumberInput
            value={line.unitPrice}
            onChange={(next) => onChange({ unitPrice: next })}
            variant="boxed"
            ariaLabel={`Đơn giá dòng ${index}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>
            Thành tiền {line.lineTotal == null ? "(tự tính)" : ""}
          </span>
          <PosNumberInput
            value={line.lineTotal ?? autoTotal}
            onChange={(next) => onChange({ lineTotal: next })}
            variant="boxed"
            ariaLabel={`Thành tiền dòng ${index}`}
          />
        </label>
      </div>

      {/* Thành tiền mặc định = SL × ĐG; chỉ nhập tay khi dòng có khuyến mãi. */}
      {line.lineTotal != null && line.lineTotal !== autoTotal ? (
        <button
          type="button"
          onClick={() => onChange({ lineTotal: null })}
          className="self-start text-[11px] font-medium text-[#5B5BD6] hover:underline"
        >
          Về tự tính (SL × ĐG = {new Intl.NumberFormat("vi-VN").format(autoTotal)})
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Nhãn khuyến mãi</span>
          <PosTextInput
            value={line.discountLabel}
            onChange={(next) => onChange({ discountLabel: next })}
            variant="boxed"
            placeholder="KM 10 % (1.650.000)"
            ariaLabel={`Nhãn khuyến mãi dòng ${index}`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Ghi chú</span>
          <PosTextInput
            value={line.note}
            onChange={(next) => onChange({ note: next })}
            variant="boxed"
            placeholder="Tặng kèm"
            ariaLabel={`Ghi chú dòng ${index}`}
          />
        </label>
      </div>
    </div>
  );
}
