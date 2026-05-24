import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { CustomerDetailTabKeyEnum } from "@erp/pos/constants/checkout.constant";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import {
  useCustomer,
  useCustomerPurchaseHistory,
} from "@erp/pos/hooks/react-query/use-query-customer";
import { useCustomerGroups } from "@erp/pos/hooks/react-query/use-query-customer-group";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { CustomerForm } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerForm/CustomerForm";
import { CustomerDetailTabs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/CustomerDetailTabs/CustomerDetailTabs";
import { DebtTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/DebtTab/DebtTab";
import { InfoTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/InfoTab/InfoTab";
import { mapCustomerToDetailData } from "@erp/pos/lib/page-libs/checkout/mapCustomerDetail";
import { mapInvoicesToPurchaseHistory } from "@erp/pos/lib/page-libs/checkout/mapPurchaseHistory";
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
  const infoFormId = useId();

  const handleOpenReset = useCallback(() => {
    setActiveTab(initialTab);
    setIsEditingInfo(false);
    setInfoSubmitting(false);
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

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of customerGroupsData ?? []) map.set(g.id, g.name);
    return map;
  }, [customerGroupsData]);

  const data: CustomerDetailData = useMemo(() => {
    if (customerRaw) {
      return mapCustomerToDetailData(customerRaw, { groupNameById });
    }
    return { name: fallbackName ?? "" };
  }, [customerRaw, groupNameById, fallbackName]);

  // Lịch sử mua hàng — fetch lười, chỉ khi dialog mở và đang ở tab "Lịch sử
  // mua hàng" để tránh gọi API thừa khi mở các tab khác.
  const branchName = usePosBranchStore((s) => s.branchName);
  const historyEnabled =
    open && activeTab === CustomerDetailTabKeyEnum.HISTORY;
  const { data: invoicesPage, isLoading: isHistoryLoading } =
    useCustomerPurchaseHistory(historyEnabled ? customerId : undefined);
  const purchaseHistory = useMemo(
    () => mapInvoicesToPurchaseHistory(invoicesPage?.data ?? [], branchName),
    [invoicesPage, branchName],
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
              onChangeCard={onChangeCard}
              onRefreshPoints={onRefreshPoints}
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
              rows={purchaseHistory}
              isLoading={isHistoryLoading}
              customerName={data.name}
              customerPhone={data.phone}
            />
          ) : null}
          {activeTab === CustomerDetailTabKeyEnum.DEBT ? (
            <DebtTab rows={data.debts ?? []} />
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
