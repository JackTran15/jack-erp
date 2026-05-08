import { useCallback, useState } from "react";
import { CustomerDetailTabKeyEnum } from "../../../constants/customer";
import { AppDialog } from "../../../../../components/AppDialog";
import { useDialogReset } from "../../../hooks/useDialogReset";
import { CustomerDetailTabs } from "./CustomerDetailTabs";
import { DebtTab } from "./DebtTab";
import { InfoTab } from "./InfoTab";
import { OverviewTab } from "./OverviewTab";
import { PurchaseHistoryTab } from "./PurchaseHistoryTab";
import type { CustomerDetailData, CustomerDetailTabKey } from "./types";

export interface CustomerDetailDialogProps {
  open: boolean;
  onClose: () => void;
  data: CustomerDetailData;
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
 * Owns its own tab state — caller only flips `open` / passes `data`.
 */
export function CustomerDetailDialog({
  open,
  onClose,
  data,
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

  const footer = footerForTab(activeTab, {
    onConfirm,
    onEdit,
    onCollectDebt,
  });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      width={1020}
      contentClassName="rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
    >
      <AppDialog.Header title={`Khách hàng: ${data.identity.name}`} />
      <AppDialog.Body>
        <CustomerDetailTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
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
        className="h-16 border-t border-gray-200 px-6"
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
