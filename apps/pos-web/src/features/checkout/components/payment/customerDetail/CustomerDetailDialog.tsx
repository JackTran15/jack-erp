import { useCallback, useMemo, useState } from "react";
import { CustomerDetailTabKeyEnum } from "@erp/pos/features/checkout/constants/customer";
import { AppDialog } from "@erp/pos/components/AppDialog";
import { useDialogReset } from "@erp/pos/features/checkout/hooks/useDialogReset";
import { useCustomer } from "@erp/pos/hooks/useCustomer";
import { useCustomerGroups } from "@erp/pos/hooks/useCustomerGroups";
import { CustomerDetailTabs } from "./CustomerDetailTabs";
import { DebtTab } from "./DebtTab";
import { InfoTab } from "./InfoTab";
import { mapCustomerToDetailData } from "./mapCustomerDetail";
import { OverviewTab } from "./OverviewTab";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import type { CustomerDetailData, CustomerDetailTabKey } from "./types";

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
  /** "Thông tin" tab — primary CTA. */
  onEdit?: () => void;
  /** "Công nợ" tab — primary CTA. */
  onCollectDebt?: () => void;
  /** Card-related callbacks for the membership card on the overview tab. */
  onChangeCard?: () => void;
  onRefreshPoints?: () => void;
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
 */
export function CustomerDetailDialog({
  open,
  onClose,
  customerId,
  fallbackName,
  initialTab = CustomerDetailTabKeyEnum.OVERVIEW,
  onConfirm,
  onEdit,
  onCollectDebt,
  onChangeCard,
  onRefreshPoints,
}: CustomerDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTabKey>(initialTab);
  const handleOpenReset = useCallback(() => {
    setActiveTab(initialTab);
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

  const footer = footerForTab(activeTab, {
    onConfirm,
    onEdit,
    onCollectDebt,
  });

  return (
    <AppDialog open={open} onClose={onClose} width={1020}>
      <AppDialog.Header title={`Khách hàng: ${data.name}`} />
      <AppDialog.Body className="pt-1">
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
      </AppDialog.Body>
      <AppDialog.Footer
        onSave={footer.onPrimary}
        saveLabel={footer.primaryLabel}
        onCancel={onClose}
      />
    </AppDialog>
  );
}

function footerForTab(
  tab: CustomerDetailTabKey,
  cbs: {
    onConfirm?: () => void;
    onEdit?: () => void;
    onCollectDebt?: () => void;
  },
): FooterConfig {
  switch (tab) {
    case CustomerDetailTabKeyEnum.OVERVIEW:
      return cbs.onConfirm
        ? { primaryLabel: "Xác nhận", onPrimary: cbs.onConfirm }
        : {};
    case CustomerDetailTabKeyEnum.INFO:
      return cbs.onEdit ? { primaryLabel: "Sửa", onPrimary: cbs.onEdit } : {};
    case CustomerDetailTabKeyEnum.DEBT:
      return cbs.onCollectDebt
        ? { primaryLabel: "Thu nợ", onPrimary: cbs.onCollectDebt }
        : {};
    case CustomerDetailTabKeyEnum.HISTORY:
    default:
      return {};
  }
}
