import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useControllableState } from "@erp/pos/hooks/common/use-controllable-state";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { PlusCircleIcon, SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PromotionTable } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/PromotionSelectionModal/PromotionTable/PromotionTable";
import { PROMOTION_SWAP_CONFIRM, PROMOTION_EXCLUDE_CONFIRM } from "@erp/pos/constants/checkout-messages.constant";
import type { PromotionItem } from "@erp/pos/interfaces/promotion.interface";

export interface PromotionSelectionModalProps {
  open: boolean;
  onClose: () => void;

  /**
   * Available promotions. When omitted or empty the table renders an empty
   * state (no illustration, just blank space — matches the spec).
   */
  promotions?: PromotionItem[];

  /**
   * Pre-selected promotion id when the modal mounts — drives the highlighted
   * row + enables the "Đồng ý" CTA. Caller may keep it controlled.
   */
  initialSelectedId?: string | null;

  /**
   * Search input is internal by default. Provide `searchValue` +
   * `onSearchChange` to lift it (e.g. for server-side filtering with
   * debounce). When uncontrolled, the modal does in-memory case-insensitive
   * filtering on `name` + `description`.
   */
  searchValue?: string;
  onSearchChange?: (next: string) => void;

  /** "Đồng ý" — confirm. Receives the chosen promotion (or null if none). */
  onConfirm?: (promotion: PromotionItem | null) => void;

  /** "Thêm khuyến mại" — opens a secondary creation flow. Omit to hide. */
  onAddPromotion?: () => void;

  /**
   * UOW-09 — thu ngân untick dòng "Đã áp dụng" (loại, có xác nhận trước —
   * xem `pendingExclude` bên dưới) hoặc tick lại dòng "Đã bỏ áp dụng" (khôi
   * phục, không cần xác nhận). Omit để tắt hẳn khả năng loại trừ.
   */
  onToggleExclude?: (promotion: PromotionItem) => void;

  /**
   * "Còn phải thu" hiện tại (`promotionPreview.data.amountAfterPromotion`) —
   * nguồn cho số tiền "trước" trong hộp xác nhận loại trừ (AC-34). Không có
   * giá trị này thì hộp xác nhận chỉ nêu tên chương trình, không nêu số tiền.
   */
  amountAfterPromotion?: number;

  /**
   * Gọi `evaluate` thật với id sắp bị loại thêm vào `excludedProgramIds`, trả
   * "còn phải thu" thật sự SAU khi loại — nguồn cho số tiền "sau" trong hộp
   * xác nhận (AC-34). KHÔNG suy ra bằng `amountAfterPromotion + discountAmount`
   * ở client: loại một CTKM có thể giải phóng tài nguyên cho một CTKM khác
   * trước đó bị RESOURCE_TAKEN tự áp thay, số tiền thật khi đó khác hẳn phép
   * cộng ngây thơ (bắt được sống 12/08/2026 — xem `useCheckoutExcludePreview`).
   * Trả `null` (lỗi/timeout) ⇒ hộp xác nhận chỉ nêu tên, không nêu số tiền.
   */
  onPreviewExclude?: (programIds: string[]) => Promise<number | null>;

  /**
   * Disable confirm when nothing is selected (default true). Set false to let
   * users confirm with no selection (e.g. clearing the applied promotion).
   */
  requireSelection?: boolean;

  /**
   * Set when the caller's data source failed to load (e.g. preview
   * `unavailable`). Replaces the search + table with an error message +
   * retry — never render an empty list as if there were simply no programs.
   */
  loadError?: string;
  /** "Thử lại" — omit to hide the retry button even when `loadError` is set. */
  onRetry?: () => void;
}


/**
 * Promotion selection dialog opened from "Voucher / Quà tặng" in the payment
 * panel. Renders a fixed-height table (empty-state friendly) plus a
 * "Khuyến mại khác" section with an outline CTA, and footer actions.
 *
 * Modular by design: state for selection + search lives inside, but every
 * collaboration point (search, confirm, add, dismiss) is a prop so the host
 * can swap in real data + handlers.
 */
export function PromotionSelectionModal({
  open,
  onClose,
  promotions,
  initialSelectedId = null,
  searchValue,
  onSearchChange,
  onConfirm,
  onAddPromotion,
  onToggleExclude,
  amountAfterPromotion,
  onPreviewExclude,
  requireSelection = true,
  loadError,
  onRetry,
}: PromotionSelectionModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  // UOW-04/T-04-03 — CTKM đang chờ xác nhận hoán đổi (tick một dòng RESOURCE_TAKEN
  // rồi bấm "Đồng ý" ở dialog chính). null = không có hoán đổi nào đang chờ.
  // Giữ luôn `previousSelectedId` (selectedId ngay trước khi tick dòng này) để
  // Huỷ trả đúng "trạng thái cũ" — không phải lựa chọn lúc mở dialog.
  const [pendingSwap, setPendingSwap] = useState<{
    item: PromotionItem;
    previousSelectedId: string | null;
  } | null>(null);
  // UOW-09/T-09-03 — CTKM đang chờ xác nhận loại bỏ (thu ngân untick một dòng
  // "Đã áp dụng"). null = không có loại trừ nào đang chờ. Khôi phục (tick lại
  // dòng "Đã bỏ áp dụng") không qua state này — không cần xác nhận.
  // `beforeAmount` chốt tại thời điểm bấm (không đọc `amountAfterPromotion`
  // prop sống trong JSX) — nếu preview tự động (debounce) ghi đè
  // `promotionPreview.data` trong lúc `onPreviewExclude` đang bay, "trước" và
  // "sau" vẫn phải cùng một lần evaluate, không lệch nguồn. `afterAmount`: kết
  // quả `onPreviewExclude` thật — null = gọi lỗi, hiện hộp không kèm số tiền.
  const [pendingExclude, setPendingExclude] = useState<{
    item: PromotionItem;
    beforeAmount: number | undefined;
    afterAmount: number | null;
  } | null>(null);
  // Chặn double-click trong lúc chờ onPreviewExclude — untick lại tất cả
  // cùng lúc sẽ hỏi 2 hộp chồng nhau nếu không chặn.
  const [previewingExclude, setPreviewingExclude] = useState(false);
  // selectedId ngay trước lần tick gần nhất — nguồn cho `previousSelectedId`
  // ở trên. Không dùng state (không cần re-render theo giá trị này).
  const preTickSelectedIdRef = useRef<string | null>(initialSelectedId ?? null);
  const searchState = useControllableState<string>({
    value: searchValue,
    defaultValue: "",
    onChange: onSearchChange,
  });
  const handleOpenReset = useCallback(() => {
    setSelectedId(initialSelectedId ?? null);
    setPendingSwap(null);
    setPendingExclude(null);
    setPreviewingExclude(false);
    preTickSelectedIdRef.current = initialSelectedId ?? null;
    searchState.reset("");
  }, [initialSelectedId, searchState]);
  useDialogReset(open, handleOpenReset);

  const rows = useMemo(() => {
    const list = promotions ?? [];
    if (onSearchChange) return list; // controlled — host already filtered
    const q = searchState.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [promotions, searchState.value, onSearchChange]);

  const confirmDisabled = requireSelection && !selectedId;

  // T-04-03 — tick một dòng RESOURCE_TAKEN rồi "Đồng ý" phải hỏi lại trước khi
  // ghi đè chương trình đang thắng (đổi số tiền khách phải trả); mọi lựa chọn
  // khác giữ nguyên hành vi cũ, confirm ngay.
  const handleConfirm = () => {
    const picked = rows.find((p) => p.id === selectedId) ?? null;
    if (picked?.reasonCode === "RESOURCE_TAKEN") {
      setPendingSwap({ item: picked, previousSelectedId: preTickSelectedIdRef.current });
      return;
    }
    onConfirm?.(picked);
    onClose();
  };

  const handleConfirmSwap = () => {
    const picked = pendingSwap?.item ?? null;
    setPendingSwap(null);
    onConfirm?.(picked);
    onClose();
  };

  // Huỷ ⇒ checkbox trả về trạng thái cũ (lựa chọn ngay trước khi tick dòng
  // RESOURCE_TAKEN này, không phải lựa chọn lúc mở dialog), không gọi API,
  // không đổi store.
  const handleCancelSwap = () => {
    const restored = pendingSwap?.previousSelectedId ?? null;
    setPendingSwap(null);
    setSelectedId(restored);
    preTickSelectedIdRef.current = restored;
  };

  // UOW-09/T-09-03/AC-33/AC-34 — untick "Đã áp dụng" (locked) đổi số tiền
  // phải thu nên phải hỏi lại trước, kèm số tiền THẬT (gọi evaluate trước khi
  // hiện hộp — xem docblock `onPreviewExclude`); tick lại "Đã bỏ áp dụng"
  // (excluded) chỉ khôi phục về trạng thái server đã tính sẵn nên không hỏi.
  const handleToggleExclude = async (promotion: PromotionItem) => {
    if (!promotion.selected) {
      onToggleExclude?.(promotion);
      return;
    }
    if (previewingExclude) return;
    setPreviewingExclude(true);
    const beforeAmount = amountAfterPromotion;
    const afterAmount = (await onPreviewExclude?.([promotion.id])) ?? null;
    setPreviewingExclude(false);
    setPendingExclude({ item: promotion, beforeAmount, afterAmount });
  };

  const handleConfirmExclude = () => {
    if (pendingExclude) onToggleExclude?.(pendingExclude.item);
    setPendingExclude(null);
  };

  const handleCancelExclude = () => {
    setPendingExclude(null);
  };

  return (
    <>
      <PosDialog open={open} onClose={onClose} width={1072}>
        <PosDialog.Header title="Chương trình khuyến mãi" />
        <PosDialog.Body>
          {loadError ? (
            <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 py-12">
              <p className="text-[14px] text-[#94A3B8]">{loadError}</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md border border-[#E2E8F0] bg-white px-4 text-[14px] font-medium text-[#0F172A]",
                    "transition-colors hover:bg-[#F8FAFC]",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
                  )}
                >
                  Thử lại
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* 4.5 Search input */}
              <div className="w-full">
                <div className="relative w-full max-w-[400px]">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]"
                  >
                    <SearchIcon size={16} />
                  </span>
                  <input
                    type="text"
                    value={searchState.value}
                    onChange={(e) => searchState.setValue(e.target.value)}
                    placeholder="Tìm kiếm tên chương trình khuyến mãi"
                    aria-label="Tìm kiếm chương trình khuyến mãi"
                    className={cn(
                      "h-9 w-full rounded-md border border-[#E2E8F0] bg-white pl-9 pr-3 text-[14px] text-[#0F172A]",
                      "placeholder:italic placeholder:text-[#94A3B8]",
                      "transition-colors hover:border-[#CBD5E1]",
                      "focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/15",
                    )}
                  />
                </div>
              </div>

              {/* 4.6 Table */}
              <div className="w-full pt-4">
                <PromotionTable
                  rows={rows}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    // Chốt lựa chọn trước khi đổi — nguồn cho "trạng thái cũ"
                    // nếu dòng vừa tick là RESOURCE_TAKEN rồi bị Huỷ hoán đổi.
                    preTickSelectedIdRef.current = selectedId;
                    setSelectedId((cur) => (cur === id ? null : id));
                  }}
                  onToggleExclude={handleToggleExclude}
                />
              </div>
            </>
          )}

          {/* 4.9 / 4.10 "Khuyến mại khác" — outline CTA */}
          {onAddPromotion && !loadError ? (
            <div className="px-6 pt-8">
              <p className="text-[14px] font-semibold text-[#0F172A]">
                Khuyến mại khác
              </p>
              <button
                type="button"
                onClick={onAddPromotion}
                className={cn(
                  "mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#6366F1] bg-white px-4 text-[14px] font-medium text-[#6366F1]",
                  "transition-colors hover:bg-[#EEF2FF] active:bg-[#E0E7FF]",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A5B4FC] focus-visible:ring-offset-2",
                )}
              >
                <PlusCircleIcon size={18} />
                Thêm khuyến mại
              </button>
            </div>
          ) : null}
        </PosDialog.Body>
        <PosDialog.Footer
          onSave={handleConfirm}
          onCancel={onClose}
          saveDisabled={confirmDisabled}
        />
      </PosDialog>

      {pendingSwap ? (
        <PosDialog open onClose={handleCancelSwap} width={420}>
          <PosDialog.Header title={PROMOTION_SWAP_CONFIRM.TITLE} />
          <PosDialog.Body>
            <p className="text-[14px] text-[#0F172A]">
              {PROMOTION_SWAP_CONFIRM.message(
                // `takenByName` không tìm thấy chương trình thắng trong
                // appliedPrograms (không nên xảy ra — resolver luôn claim +
                // apply cùng lúc — nhưng đừng hiện tên rỗng nếu có bug lạ).
                pendingSwap.item.takenByName ?? "chương trình khác",
                pendingSwap.item.name,
              )}
            </p>
          </PosDialog.Body>
          <PosDialog.Footer
            onSave={handleConfirmSwap}
            onCancel={handleCancelSwap}
            saveLabel={PROMOTION_SWAP_CONFIRM.CONFIRM_LABEL}
            cancelLabel={PROMOTION_SWAP_CONFIRM.CANCEL_LABEL}
          />
        </PosDialog>
      ) : null}

      {pendingExclude ? (
        <PosDialog open onClose={handleCancelExclude} width={420}>
          <PosDialog.Header title={PROMOTION_EXCLUDE_CONFIRM.TITLE} />
          <PosDialog.Body>
            <p className="text-[14px] text-[#0F172A]">
              {pendingExclude.beforeAmount !== undefined && pendingExclude.afterAmount !== null
                ? PROMOTION_EXCLUDE_CONFIRM.message(
                    pendingExclude.item.name,
                    pendingExclude.beforeAmount,
                    pendingExclude.afterAmount,
                  )
                : PROMOTION_EXCLUDE_CONFIRM.messageNoAmount(pendingExclude.item.name)}
            </p>
          </PosDialog.Body>
          <PosDialog.Footer
            onSave={handleConfirmExclude}
            onCancel={handleCancelExclude}
            saveLabel={PROMOTION_EXCLUDE_CONFIRM.CONFIRM_LABEL}
            cancelLabel={PROMOTION_EXCLUDE_CONFIRM.CANCEL_LABEL}
          />
        </PosDialog>
      ) : null}
    </>
  );
}
