import { useCallback, type FormEvent } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { LOYALTY_TEXT } from "@erp/pos/constants/checkout-messages.constant";
import type { DiscountPointData } from "@erp/pos/interfaces/discount-point.interface";
import { MembershipPanel } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/MembershipPanel/MembershipPanel";
import { VoucherSearchPanel } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DiscountPointDialog/VoucherSearchPanel/VoucherSearchPanel";

export interface DiscountPointDialogProps {
  open: boolean;
  onClose: () => void;

  /** Member card / stats data shown in the left panel. */
  data?: DiscountPointData;

  /**
   * Voucher search input — internal by default. Provide both
   * `searchValue` + `onSearchChange` to lift state (e.g. to debounce).
   */
  searchValue?: string;
  onSearchChange?: (next: string) => void;

  /** Fired when the user submits the search (Enter or "Tìm kiếm"). */
  onSearchVoucher?: (code: string) => void;

  /** "Đổi thẻ" pill — opens a card-change flow. Omit to disable visually. */
  onChangeCard?: () => void;

  /** Controlled "Sử dụng điểm" input — host owns the value. */
  pointsUsed?: number;
  onChangePointsUsed?: (next: number) => void;

  /**
   * "Áp dụng" — ghi `pointsUsed` vào draft local của checkout. KHÔNG gọi BE
   * (BE redeem-points chỉ được gọi ở bước finalize / `finalizeCheckoutAndPrint`).
   * Bỏ qua khi thiếu: dialog disable nút Áp dụng.
   */
  onApply?: (points: number) => void;
  /** "Bỏ dùng điểm" — reset điểm về 0 ở local. */
  onClear?: () => void;
  /**
   * `true` khi tab hiện tại đã có điểm áp dụng (`promotion.pointsRedeemed > 0`).
   * Khi true: hiển thị nút "Bỏ dùng điểm" cạnh "Áp dụng".
   */
  hasApplied?: boolean;
  /**
   * Có đang có khách hàng + thẻ thành viên hay chưa. Khi false: nút "Áp dụng"
   * disabled (dialog vẫn mở được để cashier xem trạng thái).
   */
  canApply?: boolean;
}

/**
 * "Mã ưu đãi và điểm" dialog opened from the PromoMenu's "Mã ưu đãi" entry.
 * Two-column layout: membership card panel (left) + voucher search panel
 * (right) with an empty-state illustration. Self-contained — every
 * collaboration point (data, search, points input, dismiss) is a prop so
 * the host can swap in real wiring later.
 */
export function DiscountPointDialog({
  open,
  onClose,
  data,
  searchValue,
  onSearchChange,
  onSearchVoucher,
  onChangeCard,
  pointsUsed,
  onChangePointsUsed,
  onApply,
  onClear,
  hasApplied,
  canApply,
}: DiscountPointDialogProps) {
  const searchState = useControllableState<string>({
    value: searchValue,
    defaultValue: "",
    onChange: onSearchChange,
  });
  const pointsState = useControllableState<number>({
    value: pointsUsed,
    defaultValue: 0,
    onChange: onChangePointsUsed,
  });
  const handleOpenReset = useCallback(() => {
    searchState.reset("");
    pointsState.reset(data?.member?.pointsUsed ?? 0);
  }, [data?.member?.pointsUsed, pointsState, searchState]);
  useDialogReset(open, handleOpenReset);

  const handleSubmitSearch = (e: FormEvent) => {
    e.preventDefault();
    const code = searchState.value.trim();
    if (!code) return;
    onSearchVoucher?.(code);
  };

  const handleApply = () => {
    // Clamp tối thiểu 0, ép integer — BE @IsInt() @Min(1). Khi value=0 vẫn cho
    // bấm để "reset bằng 0" (tương đương Bỏ dùng điểm), nhưng UX disable bên
    // dưới giúp tránh nhầm.
    const next = Math.max(0, Math.floor(pointsState.value ?? 0));
    if (next === 0) {
      onClear?.();
    } else {
      onApply?.(next);
    }
    onClose();
  };

  const handleClear = () => {
    pointsState.reset(0);
    onClear?.();
    onClose();
  };

  const applyDisabled =
    !canApply || !pointsState.value || pointsState.value <= 0;

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={1120}
      contentClassName="bg-[#F1F3F5] shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
    >
      <PosDialog.Header title="Mã ưu đãi và điểm" />
      <PosDialog.Body>
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto md:grid-cols-2">
          <MembershipPanel
            member={data?.member}
            onChangeCard={onChangeCard}
            pointsUsed={pointsState.value}
            onChangePointsUsed={pointsState.setValue}
          />
          <VoucherSearchPanel
            value={searchState.value}
            onChange={searchState.setValue}
            onSubmit={handleSubmitSearch}
          />
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={onApply ? handleApply : undefined}
        saveLabel={LOYALTY_TEXT.APPLY}
        saveDisabled={applyDisabled}
        onCancel={hasApplied && onClear ? handleClear : onClose}
        cancelLabel={hasApplied && onClear ? LOYALTY_TEXT.CLEAR : undefined}
      />
    </PosDialog>
  );
}
