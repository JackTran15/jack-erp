import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  cn,
} from "@erp/ui";
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
  initialTab = "overview",
  onConfirm,
  onEdit,
  onCollectDebt,
  onChangeCard,
  onRefreshPoints,
}: CustomerDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<CustomerDetailTabKey>(initialTab);

  const footer = footerForTab(activeTab, {
    onConfirm,
    onEdit,
    onCollectDebt,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[95vw] max-w-[1020px] flex-col gap-0 overflow-hidden p-0",
          "rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
        )}
      >
        <header className="flex items-center justify-between px-6 pb-4 pt-5">
          <DialogTitle className="text-[22px] font-bold leading-tight text-gray-900">
            Khách hàng: {data.identity.name}
          </DialogTitle>
          {/* Built-in close button is rendered by DialogContent at top-right. */}
        </header>

        <CustomerDetailTabs activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "overview" ? (
            <OverviewTab
              data={data}
              onChangeCard={onChangeCard}
              onRefreshPoints={onRefreshPoints}
            />
          ) : null}
          {activeTab === "info" ? <InfoTab data={data} /> : null}
          {activeTab === "history" ? (
            <PurchaseHistoryTab rows={data.purchaseHistory ?? []} />
          ) : null}
          {activeTab === "debt" ? (
            <DebtTab rows={data.debts ?? []} />
          ) : null}
        </div>

        <footer className="flex h-16 items-center justify-end gap-2 border-t border-gray-200 px-6">
          {footer.primaryLabel && footer.onPrimary ? (
            <button
              type="button"
              onClick={footer.onPrimary}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#5C6BC0] px-6 text-[14px] font-semibold text-white transition-colors hover:bg-[#4F5EA8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9FA8DA]/60"
            >
              {footer.primaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-6 text-[14px] text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9FA8DA]/40"
          >
            Đóng
          </button>
        </footer>
      </DialogContent>
    </Dialog>
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
    case "overview":
      return cbs.onConfirm
        ? { primaryLabel: "Xác nhận", onPrimary: cbs.onConfirm }
        : {};
    case "info":
      return cbs.onEdit ? { primaryLabel: "Sửa", onPrimary: cbs.onEdit } : {};
    case "debt":
      return cbs.onCollectDebt
        ? { primaryLabel: "Thu nợ", onPrimary: cbs.onCollectDebt }
        : {};
    case "history":
    default:
      return {};
  }
}
