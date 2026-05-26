import {
  ChevronDownIcon,
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { useMemo, useState, type RefObject } from "react";
import type { CustomerActionItem } from "@erp/pos/components/common/PosCustomerActions/PosCustomerActions";
import { PromoMenu } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/PromoMenu";
import { QuickExchangeBadges } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/QuickExchangeBadges/QuickExchangeBadges";
import { DepositDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/DepositDialog/DepositDialog";
import { PromotionSelectionModal } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/PromotionSelectionModal/PromotionSelectionModal";
import { CheckoutActionsSection } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CheckoutActionsSection/CheckoutActionsSection";
import { CustomerSection } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/CustomerSection/CustomerSection";
import { PaymentSection } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSection";
import {
  PAYMENT_METHODS,
  PaymentMethodEnum,
  type PaymentMethod,
} from "@erp/pos/constants/checkout.constant";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useCheckoutPromotion } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion";
import {
  selectCheckoutVariant,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";

export interface PaymentSummaryPanelProps {
  customerSearchRef: RefObject<HTMLInputElement | null>;
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  addCustomerButtonRef: RefObject<HTMLButtonElement | null>;
}

export function PaymentSummaryPanel({
  customerSearchRef,
  paymentAmountRef,
  addCustomerButtonRef,
}: PaymentSummaryPanelProps) {
  const { selectedCustomer, handleAddCustomer } = useCheckoutCustomer();
  const {
    deposit,
    setDeposit,
    paymentLines,
    handleRequireCustomerForDeposit,
  } = useCheckoutPayment();
  const { appliedPromotion, applyPromotion } = useCheckoutPromotion();

  // Tab trả theo hóa đơn → khóa khách (lấy từ hóa đơn gốc, không cho đổi/thêm).
  const variant = usePosCheckoutSessionStore(selectCheckoutVariant);
  const customerLocked = variant === CheckoutVariantEnum.INVOICE_RETURN;

  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [promoMenuOpen, setPromoMenuOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [draftDepositAmount, setDraftDepositAmount] = useState(0);
  const [draftDepositMethod, setDraftDepositMethod] = useState<PaymentMethod>(
    PaymentMethodEnum.CASH,
  );

  const hasCustomer = Boolean(selectedCustomer);

  const customerActions = useMemo<CustomerActionItem[]>(() => {
    const all: Array<CustomerActionItem & { keepWhenSelected: boolean }> = [
      {
        key: "qr",
        ariaLabel: "Quét QR khách",
        icon: <QrIcon size={16} />,
        keepWhenSelected: false,
      },
      {
        key: "add",
        ariaLabel: "Thêm khách mới",
        icon: <PlusCircleIcon size={16} className="text-green-500" />,
        onClick: handleAddCustomer,
        triggerRef: addCustomerButtonRef,
        keepWhenSelected: false,
      },
      {
        key: "voucher",
        ariaLabel: "Voucher / quà tặng",
        icon: <GiftIcon size={16} />,
        onClick: () => setPromotionDialogOpen(true),
        isToggled: promotionDialogOpen,
        secondary: {
          ariaLabel: "Mở danh sách ưu đãi nhanh",
          icon: <ChevronDownIcon size={14} />,
          onClick: () => setPromoMenuOpen((o) => !o),
          isToggled: promoMenuOpen,
        },
        popover: (
          <PromoMenu
            open={promoMenuOpen}
            onClose={() => setPromoMenuOpen(false)}
          />
        ),
        keepWhenSelected: true,
      },
    ];
    const base = hasCustomer ? all.filter((a) => a.keepWhenSelected) : all;
    // Khóa khách (invoice_return) → bỏ thao tác đổi khách (thêm khách / quét QR).
    const filtered = customerLocked
      ? base.filter((a) => a.key !== "add" && a.key !== "qr")
      : base;
    return filtered.map(({ keepWhenSelected: _k, ...rest }) => rest);
  }, [
    hasCustomer,
    customerLocked,
    handleAddCustomer,
    addCustomerButtonRef,
    promotionDialogOpen,
    promoMenuOpen,
  ]);

  const handleOpenDepositDialog = () => {
    if (!selectedCustomer) {
      handleRequireCustomerForDeposit();
      return;
    }
    setDraftDepositAmount(deposit);
    setDraftDepositMethod(paymentLines[0]?.method ?? PaymentMethodEnum.CASH);
    setDepositDialogOpen(true);
  };

  const handleConfirmDeposit = () => {
    setDeposit(Math.max(0, draftDepositAmount));
    setDepositDialogOpen(false);
  };

  return (
    <aside className="flex h-full min-w-[350px] w-[26dvw] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex-1 overflow-y-auto">
        <CustomerSection
          customerInputRef={customerSearchRef}
          actions={customerActions}
          locked={customerLocked}
        />

        <QuickExchangeBadges />

        <PaymentSection
          paymentAmountRef={paymentAmountRef}
          onDepositClick={handleOpenDepositDialog}
        />
      </div>

      <CheckoutActionsSection />

      <DepositDialog
        open={depositDialogOpen}
        amount={draftDepositAmount}
        method={draftDepositMethod}
        methods={PAYMENT_METHODS}
        onClose={() => setDepositDialogOpen(false)}
        onAmountChange={setDraftDepositAmount}
        onMethodChange={setDraftDepositMethod}
        onConfirm={handleConfirmDeposit}
      />

      <PromotionSelectionModal
        open={promotionDialogOpen}
        onClose={() => setPromotionDialogOpen(false)}
        promotions={[]}
        initialSelectedId={appliedPromotion?.id ?? null}
        onConfirm={applyPromotion}
      />
    </aside>
  );
}
