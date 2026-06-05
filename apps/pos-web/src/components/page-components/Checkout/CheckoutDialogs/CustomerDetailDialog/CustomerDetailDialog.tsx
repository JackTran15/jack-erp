import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { CustomerDetailTabKeyEnum } from "@erp/pos/constants/checkout.constant";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import {
  useCustomer,
  useCustomerSummary,
  useIssueMembershipCard,
  useMembershipCard,
  useUpdateMembershipCard,
} from "@erp/pos/hooks/react-query/use-query-customer";
import { IssueMembershipCardDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/IssueMembershipCardDialog/IssueMembershipCardDialog";
import { MembershipTierEnum } from "@erp/pos/types/customer.type";
import { useCustomerGroups } from "@erp/pos/hooks/react-query/use-query-customer-group";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import {
  selectEffectivePointsRedeemed,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { useCheckoutPromotion } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-promotion";
import { CustomerForm } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerForm/CustomerForm";
import { CustomerDetailTabs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/CustomerDetailTabs/CustomerDetailTabs";
import { DebtTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/DebtTab/DebtTab";
import { InfoTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/InfoTab/InfoTab";
import { mapCustomerToDetailData } from "@erp/pos/lib/page-libs/checkout/mapCustomerDetail";
import { OverviewTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/OverviewTab/OverviewTab";
import { PurchaseHistoryTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/PurchaseHistoryTab";
import type { CustomerDetailData } from "@erp/pos/interfaces/customer-detail.interface";
import type { CustomerDetailTabKey } from "@erp/pos/constants/checkout.constant";
import type { CustomerFormValues } from "@erp/pos/interfaces/customer-dialog.interface";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

export interface CustomerDetailDialogProps {
  open: boolean;
  onClose: () => void;
  /** Customer to display. The dialog fetches `/customers/:id` on open. */
  customerId: string;
  /** Shown in the title (and as the chip name) until the fetch resolves. */
  fallbackName?: string;
  /** Initial tab when the dialog mounts (default: "overview"). */
  initialTab?: CustomerDetailTabKey;

  // Footer actions — each tab shows a different primary CTA. Omit to hide.
  /** "Tổng quan" tab — primary CTA. */
  onConfirm?: () => void;
  /** "Công nợ" tab — primary CTA. */
  onCollectDebt?: () => void;
  /** Card-related callbacks for the membership card on the overview tab. */
  onChangeCard?: () => void;
  onRefreshPoints?: () => void;
  /**
   * Fires after the user saves edits via the in-place `CustomerForm` on the
   * "Thông tin" tab. The parent typically forwards this to `pickCustomer` so
   * the selected-customer chip refreshes with the new name.
   */
  onCustomerUpdated?: (customer: CustomerRow) => void;
}

interface FooterConfig {
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  cancelLabel?: string;
  /** Overrides the dialog-close default for the cancel button. */
  onCancel?: () => void;
}

/**
 * Detail dialog opened from the selected-customer chip in the payment panel.
 *
 * Self-contained: when `open` flips true, the dialog fetches the customer
 * record (and the customer-groups lookup) via TanStack Query, then renders
 * the four tabs from a flat `CustomerDetailData` derived in this component.
 * Callers only need to supply `customerId` and optional fallback / callbacks.
 *
 * The "Thông tin" tab shows the record as plain text (mirroring the
 * `CustomerCreateDialog` layout). Its footer CTA "Sửa" swaps the tab body
 * for the shared `CustomerForm` (mode=edit) inline — no nested dialog.
 * On save the customer cache is invalidated by `useUpdateCustomer`, so this
 * dialog's preview refreshes automatically.
 */
const TIER_LABELS: Record<string, string> = {
  none: "Không hạng",
  silver: "Bạc",
  gold: "Vàng",
  diamond: "Kim Cương",
};

export function CustomerDetailDialog({
  open,
  onClose,
  customerId,
  fallbackName,
  initialTab = CustomerDetailTabKeyEnum.OVERVIEW,
  onConfirm,
  onCollectDebt,
  onChangeCard,
  onRefreshPoints,
  onCustomerUpdated,
}: CustomerDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTabKey>(initialTab);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoSubmitting, setInfoSubmitting] = useState(false);
  const [isIssuingCard, setIsIssuingCard] = useState(false);
  const infoFormId = useId();

  const handleOpenReset = useCallback(() => {
    setActiveTab(initialTab);
    setIsEditingInfo(false);
    setInfoSubmitting(false);
    setIsIssuingCard(false);
  }, [initialTab]);
  useDialogReset(open, handleOpenReset);

  // Switching tabs always returns to view — don't carry edit state across tabs.
  useEffect(() => {
    setIsEditingInfo(false);
  }, [activeTab]);

  // Skip the fetch while the dialog is closed so we don't spam the API as the
  // checkout page re-renders. TanStack Query dedups across consumers anyway.
  const { data: customerRaw } = useCustomer(open ? customerId : undefined);
  const { data: customerGroupsData } = useCustomerGroups();
  // Summary (totals + membership snapshot) + thẻ chi tiết — chỉ cần khi tab
  // "Tổng quan" hiển thị, nhưng fetch ngay từ lúc mở dialog để UX mượt khi
  // chuyển tab (cache 30s, không tốn fetch lại).
  const summaryEnabled =
    open && activeTab === CustomerDetailTabKeyEnum.OVERVIEW;
  const { data: summary } = useCustomerSummary(
    summaryEnabled ? customerId : undefined,
  );
  const { data: card } = useMembershipCard(
    summaryEnabled ? customerId : undefined,
  );

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of customerGroupsData ?? []) map.set(g.id, g.name);
    return map;
  }, [customerGroupsData]);

  const data: CustomerDetailData = useMemo(() => {
    if (customerRaw) {
      return mapCustomerToDetailData(customerRaw, {
        groupNameById,
        summary,
        card,
      });
    }
    return { name: fallbackName ?? "" };
  }, [customerRaw, groupNameById, summary, card, fallbackName]);

  // Lịch sử mua hàng — fetch lười trong chính `PurchaseHistoryTab`, chỉ khi
  // dialog mở và đang ở tab này (server-side search). `branchName` truyền xuống
  // làm fallback tên cửa hàng khi một dòng thiếu branch.
  const branchName = usePosBranchStore((s) => s.branchName);
  const historyEnabled =
    open && activeTab === CustomerDetailTabKeyEnum.HISTORY;
  // Công nợ — fetch lười trong chính `DebtTab`, chỉ khi dialog mở & đang ở tab này.
  const debtEnabled = open && activeTab === CustomerDetailTabKeyEnum.DEBT;

  // Đổi điểm — ghi vào draft checkout (mock FE) rồi đóng dialog để hiển thị ở
  // payment summary. Prefill ô nhập bằng số điểm đang áp dụng cho đơn.
  const appliedPoints = usePosCheckoutSessionStore(selectEffectivePointsRedeemed);
  const { setRedeemedPoints } = useCheckoutPromotion();
  const handleRedeemPoints = useCallback(
    (points: number) => {
      setRedeemedPoints(points);
      onClose();
    },
    [setRedeemedPoints, onClose],
  );

  const { mutate: issueCard, isPending: isIssuingCardPending } =
    useIssueMembershipCard();
  const { mutate: updateCard, isPending: isUpdatingCardPending } =
    useUpdateMembershipCard();

  const isMembershipPending = isIssuingCardPending || isUpdatingCardPending;

  const handleMembershipConfirm = useCallback(
    (tier: string) => {
      if (data.cardCode) {
        updateCard(
          { customerId, body: { tier: tier as MembershipTierEnum } },
          { onSuccess: () => setIsIssuingCard(false) },
        );
      } else {
        const today = new Date().toISOString().slice(0, 10);
        issueCard(
          { customerId, body: { tier: tier as MembershipTierEnum, issuedAt: today } },
          { onSuccess: () => setIsIssuingCard(false) },
        );
      }
    },
    [customerId, data.cardCode, issueCard, updateCard],
  );

  const editSeed: CustomerFormValues = useMemo(
    () => ({
      id: customerId,
      code: data.code ?? undefined,
      name: data.name,
      phone: data.phone ?? undefined,
      email: data.email ?? undefined,
    }),
    [customerId, data.code, data.name, data.phone, data.email],
  );

  const handleInfoSubmitted = useCallback(
    (c: CustomerRow) => {
      setIsEditingInfo(false);
      onCustomerUpdated?.(c);
    },
    [onCustomerUpdated],
  );

  /**
   * Submit the embedded edit form programmatically. We avoid wiring the
   * footer button as native `type="submit"` because morphing it from "Sửa"
   * (type=button) to "Lưu" (type=submit) on the same DOM element in the
   * same commit can auto-fire the freshly-mounted form's submit handler
   * under React 18 + Radix Dialog.
   */
  const handleSubmitInfo = useCallback(() => {
    const form = document.getElementById(infoFormId);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }, [infoFormId]);

  const footer = footerForTab(activeTab, {
    onConfirm,
    onCollectDebt,
    isEditingInfo,
    infoSubmitting,
    onStartEditInfo: () => setIsEditingInfo(true),
    onCancelEditInfo: () => setIsEditingInfo(false),
    onSubmitInfo: handleSubmitInfo,
  });

  return (
    <PosDialog open={open} onClose={onClose} width={1020}>
      <PosDialog.Header title={`Khách hàng: ${data.name}`} />
      <PosDialog.Body className="pt-1">
        <CustomerDetailTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto py-5">
          {activeTab === CustomerDetailTabKeyEnum.OVERVIEW ? (
            <OverviewTab
              data={data}
              onChangeCard={() => setIsIssuingCard(true)}
              onRefreshPoints={onRefreshPoints}
              onIssueCard={() => setIsIssuingCard(true)}
              appliedPoints={appliedPoints}
              onRedeemPoints={handleRedeemPoints}
            />
          ) : null}
          {activeTab === CustomerDetailTabKeyEnum.INFO ? (
            isEditingInfo ? (
              <CustomerForm
                mode="edit"
                formId={infoFormId}
                customer={editSeed}
                onSubmitted={handleInfoSubmitted}
                onSubmittingChange={setInfoSubmitting}
              />
            ) : (
              <InfoTab data={data} />
            )
          ) : null}
          {activeTab === CustomerDetailTabKeyEnum.HISTORY ? (
            <PurchaseHistoryTab
              customerId={customerId}
              enabled={historyEnabled}
              branchName={branchName}
              customerName={data.name}
              customerPhone={data.phone}
            />
          ) : null}
          {activeTab === CustomerDetailTabKeyEnum.DEBT ? (
            <DebtTab
              customerId={customerId}
              enabled={debtEnabled}
              customerName={data.name}
              customerPhone={data.phone}
            />
          ) : null}
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={footer.onPrimary}
        saveLabel={footer.primaryLabel}
        saveDisabled={footer.primaryDisabled}
        cancelLabel={footer.cancelLabel}
        onCancel={footer.onCancel ?? onClose}
      />

      <IssueMembershipCardDialog
        open={isIssuingCard}
        onClose={() => setIsIssuingCard(false)}
        customerName={data.name}
        customerPhone={data.phone}
        currentTierLabel={
          data.tier ? TIER_LABELS[data.tier] ?? data.tier : null
        }
        onConfirm={handleMembershipConfirm}
        submitting={isMembershipPending}
      />
    </PosDialog>
  );
}

interface FooterCtx {
  onConfirm?: () => void;
  onCollectDebt?: () => void;
  isEditingInfo: boolean;
  infoSubmitting: boolean;
  onStartEditInfo: () => void;
  onCancelEditInfo: () => void;
  onSubmitInfo: () => void;
}

function footerForTab(
  tab: CustomerDetailTabKey,
  ctx: FooterCtx,
): FooterConfig {
  switch (tab) {
    case CustomerDetailTabKeyEnum.OVERVIEW:
      return ctx.onConfirm
        ? { primaryLabel: "Xác nhận", onPrimary: ctx.onConfirm }
        : {};
    case CustomerDetailTabKeyEnum.INFO:
      if (ctx.isEditingInfo) {
        return {
          primaryLabel: ctx.infoSubmitting ? "Đang lưu…" : "Lưu",
          primaryDisabled: ctx.infoSubmitting,
          onPrimary: ctx.onSubmitInfo,
          cancelLabel: "Hủy",
          onCancel: ctx.onCancelEditInfo,
        };
      }
      return { primaryLabel: "Sửa", onPrimary: ctx.onStartEditInfo };
    case CustomerDetailTabKeyEnum.DEBT:
      return ctx.onCollectDebt
        ? { primaryLabel: "Thu nợ", onPrimary: ctx.onCollectDebt }
        : {};
    case CustomerDetailTabKeyEnum.HISTORY:
    default:
      return {};
  }
}
