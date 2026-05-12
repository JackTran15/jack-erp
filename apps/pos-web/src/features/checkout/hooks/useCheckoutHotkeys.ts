import { useEffect, type RefObject } from "react";

interface UseCheckoutHotkeysInput {
  productSearchRef: RefObject<HTMLInputElement | null>;
  customerSearchRef: RefObject<HTMLInputElement | null>;
  catalogSearchRef?: RefObject<HTMLInputElement | null>;
  salespersonRef?: RefObject<HTMLInputElement | null>;
  priceBookRef?: RefObject<HTMLInputElement | null>;
  hasCartItems: boolean;
  onCheckout: () => void;
  onSaveDraft?: () => void;
}

export function useCheckoutHotkeys({
  productSearchRef,
  customerSearchRef,
  catalogSearchRef,
  salespersonRef,
  priceBookRef,
  hasCartItems,
  onCheckout,
  onSaveDraft,
}: UseCheckoutHotkeysInput): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      // Focus shortcuts — work from anywhere (including inside other inputs).
      if (e.key === "F3") {
        e.preventDefault();
        if (e.shiftKey) {
          catalogSearchRef?.current?.focus();
        } else {
          productSearchRef.current?.focus();
        }
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        customerSearchRef.current?.focus();
        return;
      }

      // Toolbar picker shortcuts. Use `e.code` so Mac Option key (which
      // rewrites `e.key` to e.g. "˜") still triggers correctly.
      if (e.altKey && e.code === "KeyN") {
        e.preventDefault();
        salespersonRef?.current?.focus();
        return;
      }
      if (e.altKey && e.code === "KeyB") {
        e.preventDefault();
        priceBookRef?.current?.focus();
        return;
      }

      if (inField) return;

      switch (e.key) {
        case "F9":
          e.preventDefault();
          if (hasCartItems) onCheckout();
          break;
        case "F10":
          e.preventDefault();
          onSaveDraft?.();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    productSearchRef,
    customerSearchRef,
    catalogSearchRef,
    salespersonRef,
    priceBookRef,
    hasCartItems,
    onCheckout,
    onSaveDraft,
  ]);
}
