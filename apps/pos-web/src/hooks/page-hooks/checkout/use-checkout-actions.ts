import { useCallback } from "react";
import { toast } from "sonner";

import { useInvoicePrinter } from "@erp/pos/hooks/page-hooks/checkout/use-invoice-printer";
import { useCurrentUserQuery } from "@erp/pos/hooks/react-query/use-query-user";
import { useMyBranchesQuery } from "@erp/pos/hooks/react-query/use-query-branch";
import { usePaymentAccountsQuery } from "@erp/pos/hooks/react-query/use-query-account";
import {
  useCheckoutInvoiceMutation,
  useCheckoutReturnMutation,
  useCreateExchangeInvoiceMutation,
  useCreateInvoiceMutation,
  useCreateReturnInvoiceMutation,
  useRedeemPointsMutation,
  useUpdateInvoiceMutation,
} from "@erp/pos/hooks/react-query/use-query-invoice";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerUtils";
import {
  buildCheckoutInvoicePayload,
  buildStoreInfoFromBranch,
} from "@erp/pos/lib/page-libs/checkout/checkoutReceiptFactory";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import {
  getOversellSaleLines,
  paymentLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { validateCheckout } from "@erp/pos/lib/page-libs/checkout/checkoutValidation";
import {
  buildCheckoutInvoiceApiPayload,
  buildCreateInvoicePayload,
  buildUpdateInvoicePayload,
} from "@erp/pos/lib/page-libs/checkout/invoicePayloadMapper";
import {
  buildCheckoutReturnPayload,
  buildCreateExchangePayload,
  buildCreateReturnPayload,
} from "@erp/pos/lib/page-libs/checkout/returnInvoicePayloadMapper";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import type { ResolveCheckoutPayloadError } from "@erp/pos/types/checkout.type";
import type { InvoicePayload } from "@erp/pos/dtos/invoice-printing.dto";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  CHECKOUT_ANNOUNCEMENTS,
  CHECKOUT_ERRORS,
  CHECKOUT_RETURN_REASONS,
  CHECKOUT_TOASTS,
} from "@erp/pos/constants/checkout-messages.constant";
import {
  computeReceiptLines,
  selectActiveSession,
  selectCustomerDraft,
  selectEffectivePointsRedeemed,
  selectGrandTotal,
  selectHasAnyCartLines,
  selectMetaDraft,
  selectPaymentDraft,
  selectPointsDiscountAmount,
  selectPromotionDiscountAmount,
  selectPromotionDraft,
  selectPromotionPreview,
  selectPurchaseCart,
  selectReturnCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutActionsResult {
  finalizeCheckoutAndPrint: (options?: {
    bypassOversellModal?: boolean;
  }) => Promise<void>;
  isFinalizing: boolean;
  /** Mở dialog xác nhận huỷ hoá đơn (return/exchange). */
  requestCancelInvoice: () => void;
  /** Xác nhận huỷ: remove session (nếu >1) hoặc reset session + draft UI. */
  confirmCancelInvoice: () => void;
  /** Người dùng đồng ý "vẫn bán" trên dialog oversell → finalize bỏ qua modal. */
  confirmOversell: () => Promise<void>;
}

function describeResolveError(error: ResolveCheckoutPayloadError): string {
  switch (error.code) {
    case "missing_payment_account":
      return CHECKOUT_ERRORS.MISSING_PAYMENT_ACCOUNT;
    default:
      return CHECKOUT_ERRORS.UNKNOWN_PAYMENT_ACCOUNT;
  }
}

/**
 * Terminal actions của checkout: finalize (validate + 2 API + in + reset),
 * cancel-invoice và oversell-confirm. Toàn bộ đọc state qua `getState()` tại
 * thời điểm click + `deriveSettlement` (không subscribe payment store reactive),
 * nên component consume hook này không re-render khi user gõ tiền.
 */
export const useCheckoutActions = (): UseCheckoutActionsResult => {
  const invoicePrinter = useInvoicePrinter();
  const createMutation = useCreateInvoiceMutation();
  const updateMutation = useUpdateInvoiceMutation();
  const checkoutMutation = useCheckoutInvoiceMutation();
  const redeemPointsMutation = useRedeemPointsMutation();
  const createReturnMutation = useCreateReturnInvoiceMutation();
  const createExchangeMutation = useCreateExchangeInvoiceMutation();
  const checkoutReturnMutation = useCheckoutReturnMutation();
  // "NV Thu ngân" trên bản in — user đang đăng nhập.
  const currentUserQuery = useCurrentUserQuery();
  const currentUser = currentUserQuery.data;
  const branchesQuery = useMyBranchesQuery();
  const branches = branchesQuery.data;
  // Cùng queryKey với PaymentSection nên dùng chung cache, không phát sinh request mới.
  // Cần ở đây để validateCheckout biết tài khoản đã chọn có gắn quỹ tiền gửi hay chưa.
  const { accounts: paymentAccounts } = usePaymentAccountsQuery();

  const printReceiptIfNeeded = useCallback(
    async (payload: InvoicePayload | null) => {
      if (!payload) return;
      try {
        await invoicePrinter.print(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Lỗi in hóa đơn:", err);
      }
    },
    [invoicePrinter],
  );

  const finalizeCheckoutAndPrint = useCallback(
    async (options?: { bypassOversellModal?: boolean }) => {
      const sessionState = usePosCheckoutSessionStore.getState();
      const selectedCustomer = selectCustomerDraft(sessionState).selectedCustomer;
      const selectedSalesperson =
        selectMetaDraft(sessionState).selectedSalesperson;
      const purchaseCart = selectPurchaseCart(sessionState);
      const ui = usePosCheckoutUiStore.getState();
      // Slice payment của tab đang active (snapshot tại thời điểm click F12).
      const p = selectPaymentDraft(sessionState);

      const grandTotal = selectGrandTotal(sessionState);
      const pointsDiscountAmount = selectPointsDiscountAmount(sessionState);
      const promotionDiscountAmount = selectPromotionDiscountAmount(sessionState);
      // `grandTotal` (từ `selectGrandTotal`) chỉ trừ giảm giá tay per-line —
      // KHÔNG biết gì về CTKM (đến từ preview `evaluate`, một nguồn riêng).
      // "Tổng thanh toán" trên hóa đơn in đứng ngay sau khối "Khuyến mãi"
      // (xem renderInvoiceHtml.ts) nên phải trừ luôn phần này, nếu không hóa
      // đơn in ra hiện giá gốc dù dòng "Khuyến mãi" đã trừ đúng ngay bên trên
      // nó — bắt được sống 12/08/2026. Không trừ `pointsDiscountAmount`/deposit
      // ở đây — hai cái đó in thành dòng riêng NGAY DƯỚI "Tổng thanh toán".
      const receiptGrandTotal = grandTotal - promotionDiscountAmount;
      const pointsToRedeem = selectEffectivePointsRedeemed(sessionState);
      const {
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
      } = deriveSettlement({
        grandTotal,
        deposit: p.deposit,
        returnFee: p.returnFee,
        pointsDiscountAmount,
        promotionDiscountAmount,
        paymentLines: p.paymentLines,
        keepChange: p.keepChange,
        debt: p.debt,
      });
      const primaryMethod = p.paymentLines[0]?.method ?? PaymentMethodEnum.CASH;
      const primaryMethodLabel =
        PAYMENT_METHODS.find((m) => m.value === primaryMethod)?.label ??
        String(primaryMethod);

      const result = validateCheckout({
        hasAnyCartLines: selectHasAnyCartLines(sessionState),
        debt: p.debt,
        keepChange: p.keepChange,
        selectedCustomer,
        purchaseCart,
        settlementGrandTotal,
        settlementAbs,
        totalPaid,
        changeAmount,
        shortageAmount,
        paymentLines: p.paymentLines,
        paymentAccounts,
      });

      if (!result.ok) {
        ui.setCartError(result.message);
        return;
      }
      if (
        !options?.bypassOversellModal &&
        getOversellSaleLines(purchaseCart).length > 0
      ) {
        ui.openOversell();
        return;
      }

      const note = p.note || undefined;
      const session = selectActiveSession(sessionState);
      const variant = session?.checkoutVariant ?? CheckoutVariantEnum.SALE;
      const isReturnFlow = variant !== CheckoutVariantEnum.SALE;
      // INVOICE_RETURN: credits + hàng mua mới cùng nằm trong purchaseCart.
      // QUICK_EXCHANGE: hàng trả ở returnCart, hàng mua mới ở purchaseCart.
      const returnLines =
        variant === CheckoutVariantEnum.QUICK_EXCHANGE
          ? selectReturnCart(sessionState)
          : purchaseCart.filter((l) => l.isReturnCredit);
      const cashierName = currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
        : (sessionState.cashierDisplayName ?? undefined);
      const promotionDraft = selectPromotionDraft(sessionState);
      const appliedVoucher = promotionDraft.appliedVoucher;
      const activeBranchId = usePosBranchStore.getState().branchId;
      const store = buildStoreInfoFromBranch(
        branches?.find((b) => b.id === activeBranchId),
      );

      const receiptPayload = buildCheckoutInvoicePayload({
        printInvoice: p.printInvoice,
        cart: computeReceiptLines(sessionState),
        grandTotal: receiptGrandTotal,
        settlementTotal: settlementGrandTotal,
        deposit: p.deposit,
        totalPaid,
        paymentLines: p.paymentLines,
        primaryMethodLabel,
        methods: PAYMENT_METHODS,
        keepChange: p.keepChange,
        debt: p.debt,
        customerName: selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone,
        cashierName,
        salespersonName: selectedSalesperson?.name,
        note,
        returnLines: isReturnFlow ? returnLines : [],
        returnFee: p.returnFee,
        pointsRedeemed: pointsToRedeem,
        pointsDiscountAmount,
        voucherCode: appliedVoucher?.voucherCode,
        printDuplicate: p.printDuplicate,
        isReturnExchange: isReturnFlow,
        store,
        promotionEngineDiscounts: selectPromotionPreview(sessionState).data
          ?.appliedPrograms,
      });

      try {
        if (!isReturnFlow) {
          // ── SALE ──────────────────────────────────────────────────────────
          // Dựng thử với số của FE để bắt sớm lỗi thiếu tài khoản nhận tiền —
          // trước khi tạo draft, tránh để lại hóa đơn nháp mồ côi. Body thật
          // dựng lại bên dưới khi đã biết `amountDue` do BE tính.
          const precheck = buildCheckoutInvoiceApiPayload({
            paymentLines: p.paymentLines,
            amountDue: settlementAbs,
          });
          if (!precheck.ok) {
            toast.error(describeResolveError(precheck.error));
            return;
          }
          // Tab mở từ một draft đã lưu → PATCH chính draft đó rồi checkout, để
          // hóa đơn đó rời khỏi danh sách lưu tạm. Tab thường → tạo mới.
          const sourceInvoiceId = session?.sourceInvoiceId;
          let invoiceId: string;
          let invoiceAmountDue: number;
          if (sourceInvoiceId) {
            const updated = await updateMutation.mutateAsync({
              id: sourceInvoiceId,
              body: buildUpdateInvoicePayload({
                cart: purchaseCart,
                customer: selectedCustomer,
                note,
                salesperson: selectedSalesperson,
              }),
            });
            invoiceId = updated.id;
            invoiceAmountDue = Number(updated.amountDue) || 0;
          } else {
            const created = await createMutation.mutateAsync(
              buildCreateInvoicePayload({
                sessionId: sessionState.posSessionId,
                cart: purchaseCart,
                customer: selectedCustomer,
                note,
                salesperson: selectedSalesperson,
              }),
            );
            invoiceId = created.id;
            invoiceAmountDue = Number(created.amountDue) || 0;
          }
          // Áp đổi điểm trên draft TRƯỚC khi checkout — BE validate (thẻ active /
          // balance / giá trị đơn) tại bước này; lỗi 400 bắt ngay để không vào
          // /checkout với số tiền sai. Điểm thực sự bị trừ khi /checkout commit.
          if (pointsToRedeem > 0) {
            const redeemed = await redeemPointsMutation.mutateAsync({
              id: invoiceId,
              points: pointsToRedeem,
            });
            invoiceAmountDue = Number(redeemed.amountDue) || 0;
          }
          // Trần phân bổ = min(số UI hiển thị, số BE chốt). Lấy số BE để không
          // bao giờ vượt guard `∑payments ≤ amountDue`; kẹp thêm bằng số của FE
          // để không thu quá phần thu ngân nhìn thấy khi hai bên lệch nhau
          // (đặt cọc hiện chưa được gửi lên draft).
          const checkoutResolve = buildCheckoutInvoiceApiPayload({
            paymentLines: p.paymentLines,
            amountDue: Math.min(settlementAbs, invoiceAmountDue),
            // "Tính vào công nợ" bật thì ô "khách không lấy tiền thừa" bị bỏ qua
            // trên UI (derivePaymentDisplay) — payload phải theo đúng như vậy.
            keepChange: p.keepChange && !p.debt,
            // Hạn thanh toán chỉ có nghĩa khi tính vào công nợ.
            dueDate: p.debt ? p.paymentDueDate : null,
            creditDays: p.debt ? p.creditDays : null,
            // CTKM tùy chọn — chỉ luồng SALE (đơn trả/đổi có bài toán hoàn
            // khuyến mại riêng, ngoài phạm vi UOW-02, giống preview evaluate).
            selectedProgramIds: promotionDraft.selectedProgramIds,
            // CTKM đã bỏ hẳn (UOW-09) — cùng phạm vi SALE-only như trên.
            excludedProgramIds: promotionDraft.excludedProgramIds,
          });
          if (!checkoutResolve.ok) {
            toast.error(describeResolveError(checkoutResolve.error));
            return;
          }
          const soldInvoice = await checkoutMutation.mutateAsync({
            id: invoiceId,
            body: checkoutResolve.body,
          });
          // Số hoá đơn và điểm tích đều do BE chốt, chỉ biết sau khi checkout
          // xong, nên gắn vào biên lai (dựng trước) trước khi in. Số phải là
          // `code` thật: số sinh ở client thì khách tra không ra hoá đơn nào.
          if (receiptPayload) {
            receiptPayload.invoiceNumber = soldInvoice.code;
            receiptPayload.totals.pointsEarned = soldInvoice.pointsEarned;
            receiptPayload.totals.pointsBalanceAfter =
              soldInvoice.pointsBalanceAfter ?? undefined;
          }
        } else {
          // ── RETURN / EXCHANGE ─────────────────────────────────────────────
          const newLines =
            variant === CheckoutVariantEnum.QUICK_EXCHANGE
              ? purchaseCart
              : purchaseCart.filter((l) => !l.isReturnCredit);
          const originalInvoiceId = session?.originalInvoiceId;

          if (returnLines.length === 0) {
            toast.error(CHECKOUT_TOASTS.NO_RETURN_LINES);
            return;
          }
          // BE `ReturnInvoiceLineDto.locationId` là `@IsUUID()` bắt buộc — chặn
          // sớm dòng trả thiếu vị trí kho (eligible-returns có thể trả locationId
          // rỗng) để tránh 400 "locationId must be a UUID" khó hiểu cho thu ngân.
          if (returnLines.some((l) => !l.locationId)) {
            toast.error(CHECKOUT_TOASTS.RETURN_LINE_MISSING_LOCATION);
            return;
          }

          const returnSubtotal = returnLines.reduce(
            (s, l) => s + l.unitPrice * l.qty,
            0,
          );
          const newSubtotal = newLines.reduce(
            (s, l) => s + l.unitPrice * l.qty,
            0,
          );

          // Không có hóa đơn gốc thì không có công nợ nào để cấn, và phần chênh
          // khách phải bù thì thu đủ chứ không ghi nợ (ADR-03). `PaymentSection`
          // đã ẩn hai ô tương ứng, nhưng draft persist xuống localStorage nên
          // một tab cũ vẫn có thể mang cờ `debt` — chặn cả ở đây, không chỉ ở UI.
          const allowsDebt = Boolean(originalInvoiceId);
          const putOnDebt = allowsDebt && p.debt;

          // Một chứng từ cho cả hai kiểu đổi trả. Khác biệt duy nhất còn lại là
          // CÓ hay KHÔNG hóa đơn gốc: có → EXCHANGE/RETURN "regular" (BE kiểm
          // returned_quantity, cấn được công nợ); không → "quick" (dòng tự do).
          // Trước đây luồng nhanh ghép 1 phiếu SALE + 1 phiếu RETURN: bốn call
          // không atomic, và phiếu SALE bị ép thu đủ giá trị hàng mua nên tiền
          // qua quỹ là gross-in/gross-out thay vì net.
          const checkoutResolve = buildCheckoutReturnPayload({
            returnSubtotal,
            newSubtotal,
            paymentLines: p.paymentLines,
            // Đơn ĐỔI net>0: tích "Tính vào công nợ" (DebtCheckRow) → ghi phần
            // chênh chưa thu vào công nợ khách, kèm hạn nợ như đơn bán nợ.
            putOnDebt,
            dueDate: putOnDebt ? p.paymentDueDate : null,
            creditDays: putOnDebt ? p.creditDays : null,
            note,
          });
          if (!checkoutResolve.ok) {
            toast.error(describeResolveError(checkoutResolve.error));
            return;
          }

          let invoiceId: string;
          if (newLines.length > 0) {
            // Đổi hàng theo hóa đơn thì BẮT BUỘC có hóa đơn gốc — thiếu là bug
            // của luồng chọn hóa đơn, không phải lựa chọn của thu ngân. Đổi trả
            // nhanh được phép thiếu.
            if (
              variant === CheckoutVariantEnum.INVOICE_RETURN &&
              !originalInvoiceId
            ) {
              toast.error(CHECKOUT_TOASTS.EXCHANGE_NEEDS_ORIGINAL);
              return;
            }
            const created = await createExchangeMutation.mutateAsync(
              buildCreateExchangePayload({
                sessionId: sessionState.posSessionId,
                originalInvoiceId,
                customer: selectedCustomer,
                reason: note ?? CHECKOUT_RETURN_REASONS.EXCHANGE,
                returnLines,
                newLines,
              }),
            );
            invoiceId = created.id;
          } else {
            const created = await createReturnMutation.mutateAsync(
              buildCreateReturnPayload({
                mode: originalInvoiceId ? "regular" : "quick",
                sessionId: sessionState.posSessionId,
                originalInvoiceId,
                customer: selectedCustomer,
                reason: note ?? CHECKOUT_RETURN_REASONS.RETURN,
                returnLines,
              }),
            );
            invoiceId = created.id;
          }
          const posted = await checkoutReturnMutation.mutateAsync({
            id: invoiceId,
            body: checkoutResolve.body,
          });
          if (receiptPayload) {
            receiptPayload.invoiceNumber = posted.code;
            receiptPayload.totals.pointsEarned = posted.pointsEarned;
            receiptPayload.totals.pointsReversed = posted.pointsReversed;
            receiptPayload.totals.pointsBalanceAfter =
              posted.pointsBalanceAfter ?? undefined;
          }
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : isReturnFlow
              ? CHECKOUT_TOASTS.RETURN_FAILED
              : CHECKOUT_TOASTS.PAYMENT_FAILED,
        );
        return;
      }

      const who = CHECKOUT_ANNOUNCEMENTS.customerSuffix(
        selectedCustomer ? formatCustomerDisplay(selectedCustomer) : null,
      );
      const formatVndAmount = (value: number) =>
        new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(value);
      if (isReturnFlow) {
        ui.setAnnouncement(
          CHECKOUT_ANNOUNCEMENTS.returnRecorded(
            who,
            formatVndAmount(Math.abs(settlementGrandTotal)),
          ),
        );
      } else {
        ui.setAnnouncement(
          CHECKOUT_ANNOUNCEMENTS.paymentRecorded(
            who,
            formatVndAmount(settlementGrandTotal),
            paymentLabel(primaryMethod),
          ),
        );
      }
      usePosCheckoutSessionStore.getState().resetActiveSessionAfterCheckout();
      usePosCheckoutUiStore.getState().resetCheckoutUiDraft();
      await printReceiptIfNeeded(receiptPayload);
    },
    [
      createMutation,
      updateMutation,
      checkoutMutation,
      redeemPointsMutation,
      createReturnMutation,
      createExchangeMutation,
      checkoutReturnMutation,
      currentUser,
      branches,
      paymentAccounts,
      printReceiptIfNeeded,
    ],
  );

  const requestCancelInvoice = useCallback(() => {
    usePosCheckoutUiStore.getState().openCancelInvoice();
  }, []);

  const confirmCancelInvoice = useCallback(() => {
    const ui = usePosCheckoutUiStore.getState();
    const session = usePosCheckoutSessionStore.getState();
    if (session.sessions.length > 1) {
      // Đóng tab hiện tại; draft per-tab của nó biến mất theo session.
      session.removeSession(session.activeSessionId);
    } else {
      session.resetActiveSessionAfterCheckout();
    }
    // Đóng mọi dialog + xóa cartError (transient toàn cục, không theo tab).
    ui.resetCheckoutUiDraft();
    ui.setAnnouncement(CHECKOUT_ANNOUNCEMENTS.invoiceCanceled);
  }, []);

  const confirmOversell = useCallback(async () => {
    usePosCheckoutUiStore.getState().closeOversell();
    await finalizeCheckoutAndPrint({ bypassOversellModal: true });
  }, [finalizeCheckoutAndPrint]);

  return {
    finalizeCheckoutAndPrint,
    isFinalizing:
      createMutation.isPending ||
      updateMutation.isPending ||
      checkoutMutation.isPending ||
      redeemPointsMutation.isPending ||
      createReturnMutation.isPending ||
      createExchangeMutation.isPending ||
      checkoutReturnMutation.isPending,
    requestCancelInvoice,
    confirmCancelInvoice,
    confirmOversell,
  };
};
