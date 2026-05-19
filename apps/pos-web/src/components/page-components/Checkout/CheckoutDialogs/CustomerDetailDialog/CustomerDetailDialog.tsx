import { useCallback, useMemo, useState } from "react";
import { CustomerDetailTabKeyEnum } from "@erp/pos/constants/checkout.constant";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { useCustomer } from "@erp/pos/hooks/common/use-customer";
import { useCustomerGroups } from "@erp/pos/hooks/page-hooks/checkout/use-customer-groups";
import { CustomerCreateDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerCreateDialog/CustomerCreateDialog";
import { CustomerDetailTabs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/CustomerDetailTabs/CustomerDetailTabs";
import { DebtTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/DebtTab/DebtTab";
import { InfoTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/InfoTab/InfoTab";
import { mapCustomerToDetailData } from "@erp/pos/lib/page-libs/checkout/mapCustomerDetail";
import { OverviewTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/OverviewTab/OverviewTab";
import { PurchaseHistoryTab } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/PurchaseHistoryTab";
import type { CustomerDetailData, CustomerDetailTabKey } from "@erp/pos/lib/page-libs/checkout/customerDetail.types";
import type { CustomerFormValues } from "@erp/pos/lib/page-libs/checkout/customerCreate.types";
import type { CustomerRow } from "@erp/pos/lib/common/customerApi";

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
   * Fires after the user saves edits from the nested `CustomerCreateDialog`
   * launched from the "Thông tin" tab. The parent typically forwards this to
   * `pickCustomer` so the selected-customer chip refreshes with the new name.
   */
  onCustomerUpdated?: (customer: CustomerRow) => void;
}

interface FooterConfig {
  primaryLabel?: string;
  onPrimary?: () => void;
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
 * `CustomerCreateDialog` layout). Its footer CTA "Sửa" opens a nested
 * `CustomerCreateDialog` in edit mode; on save the customer cache is
 * invalidated by `useUpdateCustomer`, so this dialog's preview refreshes.
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleOpenReset = useCallback(() => {
    setActiveTab(initialTab);
    setEditDialogOpen(false);
  }, [initialTab]);
  useDialogReset(open, handleOpenReset);

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

  const handleEditSubmitted = useCallback(
    (c: CustomerRow) => {
      setEditDialogOpen(false);
      onCustomerUpdated?.(c);
    },
    [onCustomerUpdated],
  );

  const footer = footerForTab(activeTab, {
    onConfirm,
    onCollectDebt,
    onStartEdit: () => setEditDialogOpen(true),
  });

  return (
    <>
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
              <InfoTab data={data} />
            ) : null}
            {activeTab === CustomerDetailTabKeyEnum.HISTORY ? (
              <PurchaseHistoryTab rows={data.purchaseHistory ?? []} />
            ) : null}
            {activeTab === CustomerDetailTabKeyEnum.DEBT ? (
              <DebtTab rows={data.debts ?? []} />
            ) : null}
          </div>
        </PosDialog.Body>
        <PosDialog.Footer
          onSave={footer.onPrimary}
          saveLabel={footer.primaryLabel}
          onCancel={onClose}
        />
      </PosDialog>

      <CustomerCreateDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        mode="edit"
        customer={editSeed}
        onSubmitted={handleEditSubmitted}
      />
    </>
  );
}

interface FooterCtx {
  onConfirm?: () => void;
  onCollectDebt?: () => void;
  onStartEdit: () => void;
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
      return { primaryLabel: "Sửa", onPrimary: ctx.onStartEdit };
    case CustomerDetailTabKeyEnum.DEBT:
      return ctx.onCollectDebt
        ? { primaryLabel: "Thu nợ", onPrimary: ctx.onCollectDebt }
        : {};
    case CustomerDetailTabKeyEnum.HISTORY:
    default:
      return {};
  }
}
