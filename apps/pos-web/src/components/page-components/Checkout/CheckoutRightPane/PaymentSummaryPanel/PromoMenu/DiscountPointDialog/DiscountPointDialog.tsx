import { useCallback, type FormEvent } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import type { DiscountPointData } from "@erp/pos/lib/page-libs/checkout/discountPoint.types";
import { MembershipPanel } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/DiscountPointDialog/MembershipPanel/MembershipPanel";
import { VoucherSearchPanel } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/DiscountPointDialog/VoucherSearchPanel/VoucherSearchPanel";

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
        onCancel={onClose}
      />
    </PosDialog>
  );
}
