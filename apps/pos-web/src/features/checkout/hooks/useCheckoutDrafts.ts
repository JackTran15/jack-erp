import { useCallback, useRef, useState } from "react";
import {
  createPaymentLine,
  type PaymentLine,
} from "../components/payment/PaymentMethodRow";
import type {
  CartLine,
  DraftInvoice,
  DraftInvoicePayment,
} from "../components/types";
import { PaymentMethodEnum } from "../constants/paymentMethod";
import type { CustomerRow } from "@erp/pos/lib/customerApi";
import { formatCustomerDisplay } from "@erp/pos/lib/customerApi";
import { calculateDraftTotal } from "../lib/checkoutReceiptFactory";

interface SaveDraftInput {
  cart: CartLine[];
  paymentLines: PaymentLine[];
  selectedCustomer: CustomerRow | null;
  labelForMethod: (method: PaymentLine["method"]) => string;
  announce: (message: string) => void;
  onAfterSave: () => void;
}

interface RestoreDraftInput {
  draft: DraftInvoice;
  setCart: (updater: CartLine[] | ((prev: CartLine[]) => CartLine[])) => void;
  setSelectedLineId: (id: string | null) => void;
  setPaymentLines: (updater: PaymentLine[]) => void;
  setSelectedSuggestionId: (id: string | null) => void;
  setCartError: (message: string) => void;
  announce: (message: string) => void;
}

interface DeleteDraftInput {
  id: string;
  announce: (message: string) => void;
}

export function useCheckoutDrafts() {
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [draftsDialogOpen, setDraftsDialogOpen] = useState(false);
  const draftSeqRef = useRef(1);

  const handleSaveDraft = useCallback(
    ({
      cart,
      paymentLines,
      selectedCustomer,
      labelForMethod,
      announce,
      onAfterSave,
    }: SaveDraftInput) => {
      if (cart.length === 0) return;

      const now = new Date();
      const yy = String(now.getFullYear() % 100).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const seq = String(draftSeqRef.current++).padStart(4, "0");
      const invoiceNumber = `${yy}${mm}${dd}${seq}`;

      const total = calculateDraftTotal(cart);
      const paymentsSnapshot: DraftInvoicePayment[] = paymentLines
        .filter((l) => l.amount > 0)
        .map((l) => ({
          method: l.method,
          label: labelForMethod(l.method),
          amount: l.amount,
        }));

      const snapshot: DraftInvoice = {
        id: crypto.randomUUID(),
        invoiceNumber,
        customerId: selectedCustomer?.id ?? null,
        customerName: selectedCustomer
          ? formatCustomerDisplay(selectedCustomer)
          : null,
        customerPhone: selectedCustomer?.phone ?? null,
        createdAt: now,
        lines: cart.map((l) => ({ ...l })),
        total,
        payments: paymentsSnapshot.length > 0 ? paymentsSnapshot : undefined,
      };

      setDrafts((prev) => [snapshot, ...prev]);
      announce(`Đã lưu tạm hóa đơn ${invoiceNumber}.`);
      onAfterSave();
    },
    [],
  );

  const handleRestoreDraft = useCallback(
    ({
      draft,
      setCart,
      setSelectedLineId,
      setPaymentLines,
      setSelectedSuggestionId,
      setCartError,
      announce,
    }: RestoreDraftInput) => {
      setCart(draft.lines.map((l) => ({ ...l })));
      setSelectedLineId(null);
      const restored: PaymentLine[] =
        draft.payments && draft.payments.length > 0
          ? draft.payments.map((p) => createPaymentLine(p.method, p.amount))
          : [createPaymentLine(PaymentMethodEnum.CASH)];
      setPaymentLines(restored);
      setSelectedSuggestionId(null);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setCartError("");
      announce(`Đã mở hóa đơn lưu tạm ${draft.invoiceNumber}.`);
    },
    [],
  );

  const handleDeleteDraft = useCallback(({ id, announce }: DeleteDraftInput) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    announce("Đã xóa hóa đơn lưu tạm.");
  }, []);

  return {
    drafts,
    draftsDialogOpen,
    setDraftsDialogOpen,
    handleSaveDraft,
    handleRestoreDraft,
    handleDeleteDraft,
  };
}
