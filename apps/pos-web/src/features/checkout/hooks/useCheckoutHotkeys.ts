import { useEffect, type RefObject } from "react";

interface UseCheckoutHotkeysInput {
  productSearchRef: RefObject<HTMLInputElement | null>;
  customerSearchRef: RefObject<HTMLInputElement | null>;
  hasCartItems: boolean;
  onCheckout: () => void;
  onSaveDraft: () => void;
}

export function useCheckoutHotkeys({
  productSearchRef,
  customerSearchRef,
  hasCartItems,
  onCheckout,
  onSaveDraft,
}: UseCheckoutHotkeysInput): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (inField) {
        if (e.key === "F3") {
          e.preventDefault();
          productSearchRef.current?.focus();
        }
        if (e.key === "F4") {
          e.preventDefault();
          customerSearchRef.current?.focus();
        }
        return;
      }

      switch (e.key) {
        case "F3":
          e.preventDefault();
          productSearchRef.current?.focus();
          break;
        case "F4":
          e.preventDefault();
          customerSearchRef.current?.focus();
          break;
        case "F9":
          e.preventDefault();
          if (hasCartItems) onCheckout();
          break;
        case "F10":
          e.preventDefault();
          onSaveDraft();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    customerSearchRef,
    hasCartItems,
    onCheckout,
    onSaveDraft,
    productSearchRef,
  ]);
}
