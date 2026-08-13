import { useState } from "react";
import { formatVnd } from "@erp/ui";
import { CountBadge } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/CountBadge/CountBadge";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useCheckoutPromotion } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion";
import { useCheckoutExcludePreview } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-exclude-preview";
import { PROMOTION_EXCLUDE_CONFIRM } from "@erp/pos/constants/checkout-messages.constant";
import {
  buildPromotionRowLabel,
  shouldShowPromotionRow,
} from "@erp/pos/lib/page-libs/checkout/promotionPresentation";
import {
  selectEffectivePointsRedeemed,
  selectIsReturnExchangeInvoice,
  selectItemCountForPayment,
  selectPointsDiscountAmount,
  selectPromotionPreview,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface PaymentSummaryBlockProps {
  onDepositClick?: () => void;
  onReturnFeeClick?: () => void;
}

export function PaymentSummaryBlock({
  onDepositClick,
  onReturnFeeClick,
}: PaymentSummaryBlockProps) {
  const itemCount = usePosCheckoutSessionStore(selectItemCountForPayment);
  const isReturnExchange = usePosCheckoutSessionStore(
    selectIsReturnExchangeInvoice,
  );
  const total = useCheckoutGrandTotal();
  const pointsRedeemed = usePosCheckoutSessionStore(
    selectEffectivePointsRedeemed,
  );
  const pointsDiscountAmount = usePosCheckoutSessionStore(
    selectPointsDiscountAmount,
  );
  const { excludeAllApplied, clearRedeemedPoints } = useCheckoutPromotion();
  const { previewExcluding } = useCheckoutExcludePreview();
  const { deposit, returnFee } = useCheckoutPayment();
  const promotionPreview = usePosCheckoutSessionStore(selectPromotionPreview);
  // T-09-04 — X ở dòng tổng giờ bỏ HẾT mọi CTKM đang áp (không chỉ CTKM tùy
  // chọn thu ngân từng tick, xem AskUserQuestion 12/08/2026), nên cần hỏi xác
  // nhận trước (đổi số tiền phải thu). `afterAmount: null` = đang chờ
  // `previewExcluding` HOẶC gọi lỗi — cả hai hiện hộp không kèm số tiền.
  // Không suy ra "sau" bằng `subtotal` ở client: loại hết CTKM đang áp có thể
  // để lộ tài nguyên cho CTKM khác trước đó bị RESOURCE_TAKEN tự áp thay,
  // giống hệt lý do T-09-03 gọi evaluate thật (xem `useCheckoutExcludePreview`).
  const [confirmExcludeAll, setConfirmExcludeAll] = useState<{
    programNames: string[];
    programIds: string[];
    beforeAmount: number;
    afterAmount: number | null;
  } | null>(null);
  const [previewingExcludeAll, setPreviewingExcludeAll] = useState(false);

  const handleClickExcludeAll = async () => {
    if (previewingExcludeAll || promotionPreview.status !== "ready" || !promotionPreview.data) {
      return;
    }
    const { appliedPrograms, amountAfterPromotion } = promotionPreview.data;
    const programIds = appliedPrograms.map((p) => p.programId);
    setPreviewingExcludeAll(true);
    const result = await previewExcluding(programIds);
    setPreviewingExcludeAll(false);
    setConfirmExcludeAll({
      programNames: appliedPrograms.map((p) => p.name),
      programIds,
      beforeAmount: amountAfterPromotion,
      afterAmount: result?.amountAfterPromotion ?? null,
    });
  };

  return (
    <div className="space-y-2 py-3">
      <PosSummaryRow
        label={
          <span className="inline-flex items-center gap-1.5">
            Tổng tiền <CountBadge>{itemCount}</CountBadge>
          </span>
        }
        value={formatVnd(total)}
        emphasis="strong"
      />
      {/* Giỏ rỗng vẫn gọi evaluate (dialog CTKM cần danh sách — xem
          `use-checkout-promotion-preview`), nên phải chặn ở chỗ render chứ
          không chặn preview: nhánh `ready` đã có `shouldShowPromotionRow`,
          nhánh `loading` thì chưa, nên ô xám hiện lên ở tổng tiền 0. */}
      {promotionPreview.status === "loading" && itemCount > 0 ? (
        <PosSummaryRow
          label="Khuyến mại"
          value={
            <span className="inline-block h-4 w-16 animate-pulse rounded bg-gray-100" />
          }
        />
      ) : promotionPreview.status === "ready" &&
        promotionPreview.data &&
        shouldShowPromotionRow(promotionPreview.data) ? (
        <PosSummaryRow
          label={
            promotionPreview.data.appliedPrograms.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                {buildPromotionRowLabel(promotionPreview.data)}
                <button
                  type="button"
                  onClick={handleClickExcludeAll}
                  aria-label="Bỏ áp dụng khuyến mại"
                  className="text-gray-400 transition-colors hover:text-gray-600"
                >
                  <CloseIcon size={14} />
                </button>
              </span>
            ) : (
              buildPromotionRowLabel(promotionPreview.data)
            )
          }
          value={`-${formatVnd(promotionPreview.data.promotionDiscount)}`}
        />
      ) : promotionPreview.status === "unavailable" ? (
        <p className="text-[13px] text-gray-400">Chưa tính được khuyến mại</p>
      ) : null}
      <PosSummaryRow
        label={
          onDepositClick ? (
            <button
              type="button"
              onClick={onDepositClick}
              className="text-sm  text-indigo-600 hover:text-indigo-700"
            >
              Đặt cọc
            </button>
          ) : (
            "Đặt cọc"
          )
        }
        value={formatVnd(deposit)}
      />
      {pointsRedeemed > 0 ? (
        <PosSummaryRow
          label={
            <span className="inline-flex items-center gap-1.5 text-amber-500">
              {`Đổi điểm (${pointsRedeemed})`}
              <button
                type="button"
                onClick={clearRedeemedPoints}
                aria-label="Bỏ đổi điểm"
                className="text-amber-500/80 transition-colors hover:text-amber-600"
              >
                <CloseIcon size={14} />
              </button>
            </span>
          }
          value={`-${formatVnd(pointsDiscountAmount)}`}
        />
      ) : null}
      {isReturnExchange ? (
        <PosSummaryRow
          label={
            onReturnFeeClick ? (
              <button
                type="button"
                onClick={onReturnFeeClick}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Phí đổi trả
              </button>
            ) : (
              "Phí đổi trả"
            )
          }
          value={formatVnd(returnFee)}
        />
      ) : null}

      {confirmExcludeAll ? (
        <PosDialog open onClose={() => setConfirmExcludeAll(null)} width={420}>
          <PosDialog.Header title={PROMOTION_EXCLUDE_CONFIRM.TITLE} />
          <PosDialog.Body>
            <p className="text-[14px] text-[#0F172A]">
              {confirmExcludeAll.afterAmount !== null
                ? PROMOTION_EXCLUDE_CONFIRM.messageAll(
                    confirmExcludeAll.programNames,
                    confirmExcludeAll.beforeAmount,
                    confirmExcludeAll.afterAmount,
                  )
                : PROMOTION_EXCLUDE_CONFIRM.messageAllNoAmount(confirmExcludeAll.programNames)}
            </p>
          </PosDialog.Body>
          <PosDialog.Footer
            onSave={() => {
              excludeAllApplied(confirmExcludeAll.programIds);
              setConfirmExcludeAll(null);
            }}
            onCancel={() => setConfirmExcludeAll(null)}
            saveLabel={PROMOTION_EXCLUDE_CONFIRM.CONFIRM_LABEL}
            cancelLabel={PROMOTION_EXCLUDE_CONFIRM.CANCEL_LABEL}
          />
        </PosDialog>
      ) : null}
    </div>
  );
}
