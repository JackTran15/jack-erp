import { useEffect, useMemo, useState } from "react";
import { cn } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

type DiscountType = "percent" | "amount";

const SUGGESTED_PERCENTS = [5, 10, 15, 20, 30, 50];

/**
 * Modal "Khuyến mại khác" mở từ row context menu. Cho phép áp KM dòng theo
 * `%` hoặc `VNĐ` kèm lý do bắt buộc. Lưu qua `updateLineDiscount` ở session
 * cart. Đóng modal qua close prop hoặc click "Đóng".
 */
export function LineDiscountDialog() {
  const lineDiscountDialogLineId = usePosCheckoutUiStore(
    (s) => s.lineDiscountDialogLineId,
  );
  const closeLineDiscountDialog = usePosCheckoutUiStore(
    (s) => s.closeLineDiscountDialog,
  );
  const { cart, updateLineDiscount } = useCheckoutSessionCart();

  const line = useMemo(
    () => cart.find((l) => l.lineId === lineDiscountDialogLineId) ?? null,
    [cart, lineDiscountDialogLineId],
  );

  const [type, setType] = useState<DiscountType>("percent");
  const [value, setValue] = useState<number>(0);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (!line) return;
    if (line.lineDiscount) {
      setType(line.lineDiscount.type);
      setValue(line.lineDiscount.value);
      setReason(line.lineDiscount.reason);
    } else {
      setType("percent");
      setValue(0);
      setReason("");
    }
  }, [line]);

  const trimmedReason = reason.trim();
  const valueValid =
    type === "percent" ? value > 0 && value <= 100 : value > 0;
  const saveDisabled = !line || !valueValid || trimmedReason.length === 0;

  const handleSave = () => {
    if (!line || saveDisabled) return;
    updateLineDiscount(line.lineId, {
      type,
      value,
      reason: trimmedReason,
    });
    closeLineDiscountDialog();
  };

  return (
    <PosDialog
      open={lineDiscountDialogLineId !== null}
      onClose={closeLineDiscountDialog}
      width={560}
    >
      <PosDialog.Header title="Khuyến mại khác" />
      <PosDialog.Body className="space-y-6">
        <div className="flex items-center gap-4">
          <label className="w-44 shrink-0 text-[14px] text-[#2D3142]">
            Khuyến mại theo
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setType("percent")}
              className={cn(
                "inline-flex h-9 min-w-[56px] items-center justify-center rounded-md px-3 text-[14px] font-medium transition-colors",
                type === "percent"
                  ? "bg-[#5B5FE6] text-white"
                  : "border border-[#D1D5DB] bg-white text-[#2D3142] hover:bg-gray-50",
              )}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => setType("amount")}
              className={cn(
                "inline-flex h-9 min-w-[56px] items-center justify-center rounded-md px-3 text-[14px] font-medium transition-colors",
                type === "amount"
                  ? "bg-[#5B5FE6] text-white"
                  : "border border-[#D1D5DB] bg-white text-[#2D3142] hover:bg-gray-50",
              )}
            >
              VNĐ
            </button>
          </div>
          <div className="ml-auto w-40">
            <PosNumberInput
              value={value}
              onChange={setValue}
              min={0}
              max={type === "percent" ? 100 : undefined}
              step={type === "percent" ? 1 : 1000}
              ariaLabel="Giá trị khuyến mại"
              variant="underline"
              align="right"
            />
          </div>
        </div>

        <div className="flex items-start gap-4">
          <label className="w-44 shrink-0 pt-2 text-[14px] text-[#2D3142]">
            Đề xuất
          </label>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PERCENTS.map((pct) => {
              const active = type === "percent" && value === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setType("percent");
                    setValue(pct);
                  }}
                  className={cn(
                    "inline-flex h-8 min-w-[52px] items-center justify-center rounded-md px-3 text-[13px] font-medium transition-colors",
                    active
                      ? "border border-[#5B5FE6] bg-[#EEF2FF] text-[#5B5FE6]"
                      : "border border-[#D1D5DB] bg-white text-[#2D3142] hover:bg-gray-50",
                  )}
                >
                  {pct}%
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="w-44 shrink-0 text-[14px] text-[#2D3142]">
            Lý do khuyến mại <span className="text-[#F0563E]">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do ..."
            aria-label="Lý do khuyến mại"
            className="h-9 flex-1 border-b border-[#E2E5EA] bg-transparent text-[14px] text-[#2D3142] placeholder:italic placeholder:text-gray-400 focus:border-[#2F62F0] focus:outline-none"
          />
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleSave}
        onCancel={closeLineDiscountDialog}
        saveDisabled={saveDisabled}
      />
    </PosDialog>
  );
}
